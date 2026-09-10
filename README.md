# AIProxy 多源代理接口

这个目录只负责 CPA 的独立出站代理，不涉及 sub2api。

当前已接入：GOOD_01 一套主订阅、BAD_01 和 BAD_02 两套备用订阅；GOOD_02 到 GOOD_04、BAD_03 到 BAD_04 仍是预留槽位。

GOOD_01 的订阅服务证书需要跳过校验才能更新，后续服务端修复证书后应移除该选项。

## 填写代理

GOOD_01 到 GOOD_04 是好代理槽位，BAD_01 到 BAD_04 是备用或低成本代理槽位。每个槽位文件使用标准 Mihomo provider 格式，例如：

```yaml
proxies:
  - name: example-node
    type: vmess
    server: example.invalid
    port: 443
    uuid: replace-me
    alterId: 0
    cipher: auto
    tls: true
```

把真实节点或订阅转换后的 provider 内容放入对应 providers/*.yaml 文件。若使用订阅 URL，需要把对应 provider 从 type: file 改为 type: http，并填写私有 url 和 path；不要把 URL、token 或密码提交到仓库。

填好后在本目录运行：

```powershell
docker compose up -d
docker logs --tail 100 ai-proxy
```

管理控制器只映射到本机地址，secret 只写入本地 `config.yaml`。CPA 接入前先验证 AI-OUT 有可用节点；空槽位不会直连，代理不可用时请求应失败。

## 打开后台页面

本地 MetaCubeXD 页面地址：

```text
http://localhost:9091/
```

页面中的后端地址填写 `http://localhost:9090`，密钥填写本地 `config.yaml` 中 `secret:` 后面的值（只复制引号内的 32 位字符，不要复制引号），然后点击“连接”。页面和控制器都只绑定本机地址，不对局域网或公网开放。概览主页右上角还会显示当前 `AI-OUT` 实际使用的节点和链路，并每 15 秒刷新一次；状态卡由本地包装服务读取控制器，不会把 secret 放到浏览器脚本中。

## 多站点延迟复核

Mihomo 原生每个代理组只使用一个健康检查地址，因此自动故障转移仍以 `https://www.gstatic.com/generate_204` 为主。为了避免某个测试站点单独不可达造成误判，MetaCubeXD 的代理页增加了“多站点延迟复核”浮窗，可按国家组手动触发以下三个地址的测试：

- `https://www.gstatic.com/generate_204`（Google static）
- `https://cp.cloudflare.com/generate_204`（Cloudflare）
- `https://www.google.com/generate_204`（Google）

任一地址返回预期的 HTTP 204，就会在复核结果中标记节点可用；这项复核是按需执行的，不会改变现有 `*-AUTO` 故障转移逻辑，也不会定时额外消耗订阅流量。当前配置关闭 IPv6，名称带 `IPv6 Only` 的节点不纳入使用判断。

## 分组约定

保持 GOOD_01、BAD_01 等 provider 名称以及 AI-GOOD、AI-BAD、AI-OUT 组名不变。AI-GOOD 默认选择日本组，也可以在后台切换到按地区划分的好代理组（香港、澳门、台湾、日本、韩国、新加坡、马来西亚、越南、印度尼西亚、美国、英国、乌克兰、澳大利亚）。每个地区组都是可选择组，第一项是该地区的 `*-AUTO` 故障转移组，后面是具体节点；选 AUTO 保留自动故障转移，选具体节点则表示手动固定该节点。已关闭 IPv6，名称带 `IPv6 Only` 的节点从地区组和自动组中排除。日本自动组每 60 秒检查一次，其余总入口相关自动组每 120 秒检查一次，连续 3 次失败才切换，单次检查超时 5 秒。以后增删线路只改 provider 文件和对应 use 列表，CPA 仍固定使用 http://ai-proxy:7890。

GOOD_01、BAD_01、BAD_02 这三条远程订阅每 3 小时刷新一次；GOOD_02 到 GOOD_04、BAD_03 到 BAD_04 是本地 provider 文件，不执行远程订阅刷新。Mihomo 日志级别为 warning，Docker 日志限制为每个容器最多 3 个 10 MB 文件。

## 将 CPA 接入代理

当前 CPA 尚未切换，现有 CPA 请求保持原样。确认至少一个 GOOD 槽位可用后，再在 CPA 配置中将全局 proxy-url 设置为：

```yaml
proxy-url: "http://ai-proxy:7890"
```

然后只重建 CPA：

```powershell
cd <CLIProxyAPI-directory>
docker compose up -d cli-proxy-api
```

不要执行 sub2api 目录下的 Compose 命令。切换后先用 CPA 做普通请求和长流测试，再继续使用。
