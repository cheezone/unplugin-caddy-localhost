export interface Options {
  /** 必填。允许 xxx.localhost 形式，例如 "novel.localhost"、"admin.localhost"。 */
  host: `${string}.localhost`
  /** 可选。Caddy Admin API 地址，默认 "http://127.0.0.1:2019"。 */
  caddyAdmin?: string
  /** 可选。当 Caddy API 不可达时是否自动执行 `caddy run`，默认 true。 */
  autoStartCaddy?: boolean
}
