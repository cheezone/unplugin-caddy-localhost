# Agent 规则

## Caddy 反代 dial

- **禁止在代码里明文写 `127.0.0.1` 作为 upstream dial。**
- 必须使用 **listener 的 `url`**（或 `listener.urls[0]`）解析出的 **host:port** 作为 Caddy 的 upstream dial。
- 例如：listener 给出 `http://localhost:3002/` → dial 为 `localhost:3002`，不得改为 `127.0.0.1:3002`。
