// Official registry snapshots verified 2026-09-07. No mutable latest/stable tags.
export const ENGINE_INSTALLS = {
  freqtrade: { version: '2026.8', port: 8791, ui: true, health: '/api/v1/ping', image: 'freqtradeorg/freqtrade@sha256:4d23160b501d2b34579e76f57ad75edfa274967cd0dd824ff1c1b86d8c166ab4', runtimeImage: 'freqtradeorg/freqtrade:2026.8', source: 'https://github.com/freqtrade/freqtrade/tree/2026.8' },
  nautilus: { version: '1.231.0', ui: false, build: true, image: 'welink/nautilus:1.231.0', runtimeImage: 'welink/nautilus:1.231.0', source: 'https://github.com/nautechsystems/nautilus_trader/tree/v1.231.0' },
  hummingbot: { version: '2.16.0 / API 1.0.1', port: 8793, ui: true, health: '/_stcore/health', image: 'hummingbot/hummingbot-api@sha256:76ea7a05f5ea5988c0f5c65ab39e90995a3dce083cce085f39ba6598a1df2617', runtimeImage: 'hummingbot/hummingbot:version-2.16.0', source: 'https://github.com/hummingbot/hummingbot-api/tree/v1.0.1' },
  lean: { version: '18057', ui: false, image: 'quantconnect/lean@sha256:d4e857b5145d5051f7455e9e2d5d869032cbe945840975cad2e0af67ac539801', runtimeImage: 'quantconnect/lean:18057', source: 'https://github.com/QuantConnect/Lean/tree/23b735d99a357807dc0df9f4c51d30f05fe0d277' },
  jesse: { version: '3.1.1', port: 8795, ui: true, health: '/', build: true, image: 'salehmir/jesse@sha256:c432b44b0c2c4987210780e87d99fa459243aa5d8e83107f395411e4b663488c', runtimeImage: 'welink/jesse:3.1.1', source: 'https://github.com/jesse-ai/jesse/tree/v3.1.1' },
  octobot: { version: '2.1.1', port: 8796, ui: true, health: '/', image: 'drakkarsoftware/octobot@sha256:415d93a9d676817bbe52fcd2a8d47fba146f04392e8a24651e4a432abdbf4628', runtimeImage: 'drakkarsoftware/octobot:2.1.1', source: 'https://github.com/Drakkar-Software/OctoBot/tree/2.1.1' },
};
