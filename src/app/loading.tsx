import { FriendlyLoader } from "@/components/ui/FriendlyLoader";

export default function AppLoadingPage() {
  return (
    <FriendlyLoader
      message="Cargando tu espacio en I-bita..."
      subtitle="Estamos ordenando los datos de manera segura para que sigas sin apuros."
    />
  );
}
