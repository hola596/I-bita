import "server-only";
import Decimal from "decimal.js";
import {
  createPublicClient,
  http,
  parseAbiItem,
  parseEventLogs,
  isAddressEqual,
  type PublicClient,
  type TransactionReceipt,
  type Address,
  type Hex,
} from "viem";
import { polygon } from "viem/chains";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";

export const USDT_POLYGON_DECIMALS = 6 as const;

export const TRANSFER_EVENT_ABI = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export interface NormalizedUsdtTransfer {
  txHash: Hex;
  blockNumber: bigint;
  contractAddress: Address;
  from: Address;
  to: Address;
  valueUnits: bigint;
  amountUsdt: string;
}

export interface UsdtOnchainVerificationResult {
  valid: boolean;
  txHash: Hex;
  receiptStatus: "success" | "reverted";
  blockNumber: bigint;
  transfer: NormalizedUsdtTransfer;
  receipt: TransactionReceipt;
}

export interface VerifyUsdtOptions {
  client?: PublicClient;
  rpcUrl?: string;
  usdtContract?: string;
  treasuryWallet?: string;
}

/**
 * Crea un cliente público de Viem conectado a Polygon PoS con timeout y reintentos.
 */
export function createPolygonPublicClient(rpcUrl?: string): PublicClient {
  return createPublicClient({
    chain: polygon,
    transport: http(rpcUrl ?? env.EVM_RPC_URL, {
      timeout: 15_000,
      retryCount: 3,
      retryDelay: 1_000,
    }),
  });
}

/**
 * Convierte un monto en USDT (ej: "150.00" o "150.500000") a unidades base (6 decimales) usando decimal.js.
 */
export function usdtAmountToUnits(amount: string | number): bigint {
  const dec = new Decimal(amount);
  if (dec.isNaN() || dec.isNegative()) {
    throw new AppError("VALIDATION_ERROR", "Monto USDT inválido.", 422);
  }
  const unitsDec = dec.mul(new Decimal(10).pow(USDT_POLYGON_DECIMALS)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return BigInt(unitsDec.toFixed(0));
}

/**
 * Convierte unidades base de USDT (bigint) a string formateado con 6 decimales usando decimal.js.
 */
export function usdtUnitsToAmount(units: bigint): string {
  const dec = new Decimal(units.toString()).div(new Decimal(10).pow(USDT_POLYGON_DECIMALS));
  return dec.toDecimalPlaces(USDT_POLYGON_DECIMALS, Decimal.ROUND_HALF_UP).toFixed(USDT_POLYGON_DECIMALS);
}

/**
 * Normaliza y valida un hash de transacción EVM (0x + 64 caracteres hex).
 */
export function normalizeTxHash(txHash: string): Hex {
  const trimmed = txHash.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Hash de transacción inválido (debe comenzar con 0x seguido de 64 caracteres hexadecimales).",
      422
    );
  }
  return trimmed as Hex;
}

/**
 * Verifica on-chain con Viem en Polygon PoS:
 *  1. getTransactionReceipt: valida que exista y status === 'success'.
 *  2. parseEventLogs: valida que se haya emitido el evento Transfer.
 *  3. Valida que el contrato sea exactamente el USDT oficial en Polygon.
 *  4. Valida que el destinatario ('to') sea la billetera de tesorería/escrow de I-bita.
 *  5. Valida que el monto transferido ('value') coincida exactamente con la reserva (6 decimales, decimal.js).
 */
export async function verifyUsdtPaymentReceipt(
  txHash: string,
  expectedUsdtAmount: string | number,
  options: VerifyUsdtOptions = {}
): Promise<UsdtOnchainVerificationResult> {
  const normalizedHash = normalizeTxHash(txHash);

  const targetUsdtContract = (options.usdtContract ?? env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS) as Address;
  const targetTreasury = (options.treasuryWallet ?? env.NEXT_PUBLIC_IBITA_TREASURY_WALLET) as Address;
  const client = options.client ?? createPolygonPublicClient(options.rpcUrl);

  const expectedUnits = usdtAmountToUnits(expectedUsdtAmount);
  if (expectedUnits <= 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El monto esperado de la reserva debe ser mayor a 0 USDT.",
      422
    );
  }

  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: normalizedHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      `No se pudo obtener el recibo de la transacción en Polygon: ${message}`,
      422
    );
  }

  if (!receipt) {
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      "Recibo de transacción no encontrado en la blockchain de Polygon.",
      422
    );
  }

  if (receipt.status !== "success") {
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      "La transacción on-chain fue revertida o falló en Polygon (status != success).",
      422
    );
  }

  // Parsear eventos Transfer de los logs del recibo
  let transferLogs;
  try {
    transferLogs = parseEventLogs({
      abi: [TRANSFER_EVENT_ABI],
      logs: receipt.logs,
      eventName: "Transfer",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      `Error al decodificar los eventos Transfer de la transacción: ${message}`,
      422
    );
  }

  if (!transferLogs || transferLogs.length === 0) {
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      "La transacción no emitió ningún evento Transfer de token ERC-20.",
      422
    );
  }

  // 1. Filtrar eventos provenientes del contrato oficial de USDT
  const usdtLogs = transferLogs.filter((log) => {
    try {
      return isAddressEqual(log.address, targetUsdtContract);
    } catch {
      return false;
    }
  });

  if (usdtLogs.length === 0) {
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      `La transacción no involucra el contrato oficial de USDT en Polygon (${targetUsdtContract}).`,
      422
    );
  }

  // 2. Filtrar eventos dirigidos a la billetera de tesorería de I-bita
  const treasuryLogs = usdtLogs.filter((log) => {
    try {
      return isAddressEqual(log.args.to, targetTreasury);
    } catch {
      return false;
    }
  });

  if (treasuryLogs.length === 0) {
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      `La transferencia de USDT no tiene como destinatario la billetera de tesorería de I-bita (${targetTreasury}).`,
      422
    );
  }

  // 3. Validar coincidencia exacta de monto
  const matchingTransferLog = treasuryLogs.find(
    (log) => log.args.value === expectedUnits
  );

  if (!matchingTransferLog) {
    // Si hay una transferencia pero con monto diferente, reportar detalle
    const firstTreasuryLog = treasuryLogs[0];
    const actualUnits = firstTreasuryLog ? firstTreasuryLog.args.value : 0n;
    const actualFormatted = usdtUnitsToAmount(actualUnits);
    const expectedFormatted = usdtUnitsToAmount(expectedUnits);
    throw new AppError(
      "ONCHAIN_RECEIPT_INVALID",
      `El monto transferido (${actualFormatted} USDT) no coincide con el total esperado de la reserva (${expectedFormatted} USDT).`,
      422
    );
  }

  const normalizedTransfer: NormalizedUsdtTransfer = {
    txHash: normalizedHash,
    blockNumber: receipt.blockNumber,
    contractAddress: targetUsdtContract,
    from: matchingTransferLog.args.from,
    to: matchingTransferLog.args.to,
    valueUnits: matchingTransferLog.args.value,
    amountUsdt: usdtUnitsToAmount(matchingTransferLog.args.value),
  };

  return {
    valid: true,
    txHash: normalizedHash,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber,
    transfer: normalizedTransfer,
    receipt,
  };
}
