# Provider 文件目录

把本地节点或订阅转换后的 Mihomo provider 文件放在此目录，并保持与
`config.yaml` 中 `GOOD_01` 到 `GOOD_04`、`BAD_01` 到 `BAD_04` 对应的文件名。

此目录中的真实 provider 文件可能包含订阅 URL、Token、节点地址和 UUID，
因此默认被 `.gitignore` 排除。提交前请确认没有使用 `git add -f` 强制加入真实文件。

如需提交格式示例，请使用名称以 `.example.yaml` 结尾的脱敏文件。
