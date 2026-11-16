declare module "ssrf-req-filter" {
  import type http from "node:http";
  import type https from "node:https";

  function ssrfReqFilter(url: string): http.Agent | https.Agent;
  namespace ssrfReqFilter {
    function requestFilterHandler<T extends http.Agent | https.Agent>(agent: T): T;
  }

  export = ssrfReqFilter;
}
