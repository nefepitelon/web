# Perpdex Box public exchange icons

Verified and downloaded on **2026-11-07**. The dashboard serves these images from local static files; the browser does not request logos from external services.

- All 53 catalog IDs are covered, including `tradexyz`, `entropy`, `paragon`, and `kinetiq-markets` (HIP-3).
- URLs were obtained from the live CoinGecko derivatives exchange metadata, DefiLlama protocol metadata, or the official application HTML icon declarations.
- The original 32 mappings serve unchanged PNG/JPEG/WebP downloads. The 21 new mappings below use static PNG output or reuse the existing Lighter raster. Every image was decoded with Sharp; shipped files contain no SVG, HTML, JavaScript, animated frames, or external references.
- `gmx` uses the official GMX application icon, rather than the differently branded GMX Solana market icon. `drift` uses the current official Velocity icon, matching its catalog display name.
- Mapping export: `perpdexExchangeIcons: Readonly<Record<string, string>>` in `lib/perpdex-box-icons.ts`.

Asset validation: **53 / 53 IDs**. The 20 additional static PNG files total **177,490 bytes**; `lighter-rh` reuses the existing Lighter icon. Original 32 assets total 215,255 bytes.

Metadata discovery endpoints:

- [CoinGecko derivatives exchanges](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1)
- [DefiLlama protocols](https://api.llama.fi/protocols)

| Catalog ID | Local static file | Size | Public original image | Discovery source |
| --- | --- | --- | --- | --- |
| `hyperliquid` | `/perpdex-icons/hyperliquid.png` | 50 × 50; 2,852 B | [Image](https://coin-images.coingecko.com/markets/images/1208/small/Hyperliquid_logo.png?1706865217) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `tradexyz` | `/perpdex-icons/tradexyz.png` | 180 × 180; 4,714 B | [Image](https://app.trade.xyz/apple-touch-icon.png) | [Official application HTML](https://app.trade.xyz) |
| `variational` | `/perpdex-icons/variational.png` | 50 × 50; 1,306 B | [Image](https://coin-images.coingecko.com/markets/images/22231/small/Variational_Blue_Space-Blue-Mark-Space-Blue-Background.png?1773646635) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `aster` | `/perpdex-icons/aster.png` | 50 × 50; 2,491 B | [Image](https://coin-images.coingecko.com/markets/images/22084/small/aster-profile-200.png?1756966162) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `lighter` | `/perpdex-icons/lighter.jpg` | 50 × 50; 1,312 B | [Image](https://coin-images.coingecko.com/markets/images/22097/small/lighter.jpg?1758003181) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `grvt` | `/perpdex-icons/grvt.jpg` | 50 × 50; 769 B | [Image](https://coin-images.coingecko.com/markets/images/11862/small/grvt.jpg?1768789669) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `qfex` | `/perpdex-icons/qfex.png` | 50 × 50; 1,314 B | [Image](https://coin-images.coingecko.com/markets/images/22307/small/icon.png?1783654236) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `edgex` | `/perpdex-icons/edgex.png` | 50 × 50; 931 B | [Image](https://coin-images.coingecko.com/markets/images/11726/small/Square.png?1775697036) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `gmx` | `/perpdex-icons/gmx.png` | 180 × 180; 10,762 B | [Image](https://app.gmx.io/favicon/apple-icon-180x180.png) | [Official application HTML](https://app.gmx.io) |
| `arcus` | `/perpdex-icons/arcus.webp` | 50 × 50; 798 B | [Image](https://coin-images.coingecko.com/markets/images/22333/small/arucs_cg_logo.webp?1786077146) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `entropy` | `/perpdex-icons/entropy.png` | 180 × 180; 3,032 B | [Image](https://entropy.io/apple-touch-icon.png?v=entropy-7) | [Official application HTML](https://entropy.io) |
| `extended` | `/perpdex-icons/extended.png` | 50 × 50; 946 B | [Image](https://coin-images.coingecko.com/markets/images/22114/small/extended.png?1759117306) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `apex` | `/perpdex-icons/apex.jpg` | 50 × 50; 2,002 B | [Image](https://coin-images.coingecko.com/markets/images/1669/small/100*100.PNG?1721201012) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `pacifica` | `/perpdex-icons/pacifica.png` | 50 × 50; 1,467 B | [Image](https://coin-images.coingecko.com/markets/images/22171/small/Cyan_Logo_Dark_Background_%281%29.png?1764569549) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `backpack` | `/perpdex-icons/backpack.png` | 50 × 50; 1,903 B | [Image](https://coin-images.coingecko.com/markets/images/11822/small/backpack_copy.png?1737022481) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `orderly` | `/perpdex-icons/orderly.png` | 50 × 50; 4,228 B | [Image](https://coin-images.coingecko.com/markets/images/1394/small/Orderly_Network_Coingecko_200*200.png?1706865398) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `nado` | `/perpdex-icons/nado.png` | 50 × 50; 697 B | [Image](https://coin-images.coingecko.com/markets/images/22281/small/Nado_Logo.png?1780996451) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `risex` | `/perpdex-icons/risex.png` | 50 × 50; 1,262 B | [Image](https://coin-images.coingecko.com/markets/images/22327/small/logo400x400.png?1785210542) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `ondo` | `/perpdex-icons/ondo.png` | 50 × 50; 1,541 B | [Image](https://coin-images.coingecko.com/markets/images/22257/small/JTF90Lsr_400x400.png?1777450639) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `vest` | `/perpdex-icons/vest.jpg` | 50 × 50; 1,562 B | [Image](https://coin-images.coingecko.com/markets/images/11918/small/pfp.jpg?1742805756) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `dydx` | `/perpdex-icons/dydx.png` | 50 × 50; 3,068 B | [Image](https://coin-images.coingecko.com/markets/images/1451/small/dydx.png?1736390310) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `jupiter` | `/perpdex-icons/jupiter.webp` | 400 × 400; 71,476 B | [Image](https://icons.llamao.fi/icons/protocols/jupiter-perpetual-exchange) | [DefiLlama](https://api.llama.fi/protocols) |
| `txflow` | `/perpdex-icons/txflow.webp` | 400 × 400; 9,666 B | [Image](https://icons.llamao.fi/icons/protocols/txflow-bridge) | [DefiLlama](https://api.llama.fi/protocols) |
| `paradex` | `/perpdex-icons/paradex.jpg` | 50 × 50; 1,713 B | [Image](https://coin-images.coingecko.com/markets/images/1310/small/paradex.jpg?1772694430) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `paragon` | `/perpdex-icons/paragon.png` | 180 × 180; 4,837 B | [Image](https://paragon.trade/apple-touch-icon.png) | [Official application HTML](https://paragon.trade) |
| `aevo` | `/perpdex-icons/aevo.png` | 50 × 50; 2,431 B | [Image](https://coin-images.coingecko.com/markets/images/1255/small/aevo.png?1706865259) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `ostium` | `/perpdex-icons/ostium.webp` | 400 × 400; 35,712 B | [Image](https://icons.llamao.fi/icons/protocols/ostium) | [DefiLlama](https://api.llama.fi/protocols) |
| `decibel` | `/perpdex-icons/decibel.png` | 192 × 192; 16,478 B | [Image](https://app.decibel.trade/icons/icon-192.png) | [Official application HTML](https://app.decibel.trade) |
| `standx` | `/perpdex-icons/standx.jpg` | 50 × 50; 1,385 B | [Image](https://coin-images.coingecko.com/markets/images/22204/small/feNHLBvt_400x400.jpg?1770608444) | [CoinGecko](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) |
| `reya` | `/perpdex-icons/reya.webp` | 250 × 250; 13,272 B | [Image](https://icons.llamao.fi/icons/protocols/reya-perps) | [DefiLlama](https://api.llama.fi/protocols) |
| `kinetiq-markets` | `/perpdex-icons/kinetiq-markets.png` | 240 × 228; 4,765 B | [Image](https://markets.xyz/assets/brand/markets/markets-logomark-light.png) | [Official application HTML](https://markets.xyz) |
| `drift` | `/perpdex-icons/drift.png` | 180 × 180; 4,563 B | [Image](https://app.velocity.exchange/apple-touch-icon.png) | [Official application HTML](https://app.velocity.exchange) |

## Integrity hashes

SHA-256 hashes of the original downloaded bytes:

| Catalog ID | SHA-256 |
| --- | --- |
| `aevo` | `7fb371469f4ad3c69807c2402bf54e94f810bf71ff841bdb611006f1c259eee9` |
| `apex` | `548b5c2a15a24e8c647967431063503a329a9f39ea1919d46ea9269476af52ed` |
| `arcus` | `67bcd348710338ff58b804034c5876aad01e8bd6a33d5b8afae98e44a9ab1628` |
| `aster` | `0720fdd2218f0d035cf65c9d91ac61c4b5994481e12238f69f497f6fce7c9a9c` |
| `backpack` | `16c83b50f1644333f4c646a1db1790088fd43c69403646c0985590b270b3a413` |
| `decibel` | `70b2a669956715a89f74cdf3b343df373ebf3e6826422d2f41ece0a553c96c10` |
| `drift` | `7c32986bd076cc06877869b6bb30114f3a9901dda697bc990a4bff8781dfd821` |
| `dydx` | `3bd31496e6f5a2cac1084bb027ad02658a83858fc26b105da1bf04286b423a6f` |
| `edgex` | `3e12d2acbef94018c1150fb51e2c03a24cc5ff9ee96034cbfe2583809909bf9b` |
| `entropy` | `112481237877964cb8cffd843dbc03c6833bc4dbd6746df14d672b477dec9599` |
| `extended` | `b7ba85907a806dc8ec2d5f77f646e1266279b04c07822f18b829cf63bcabc8c7` |
| `gmx` | `c5dda0c6b92158a1a00eb3967b76181508581be868cf0731cc2c832a13480443` |
| `grvt` | `651cd350644af76afac2cbb77e18fff050b79be2f27940937381262266a282de` |
| `hyperliquid` | `92695ca1c883d3f57d991e5f18b249229e6de540b07d6fa99cd02012f6d33ca7` |
| `jupiter` | `3eae99d6e6b1d14fa5ff0c6454e4e16572e91a885d3b2eabde82546c069982af` |
| `kinetiq-markets` | `1a289b35d534bde8c959c642941c8b1898eb65995d5d7c895520059ca54844c6` |
| `lighter` | `ee6db8dca698f0782c3cb4514fe68e5e21bb3dc47ea9f02ac69e185ae2ea4d34` |
| `nado` | `832416c81be00537f649b6e99df747131b195c0c28376b5ebba990ca9a2b2543` |
| `ondo` | `37042d8d145c8d833ebceb3588675d77a483500c2a85325408b04b2685e13215` |
| `orderly` | `f69b1cf32d3dcf73225c780fda53874339009a33e40bfc9a1d46cf917121741d` |
| `ostium` | `02a53170f86981bb11467be9d5391a4647b4e7196a118af8ad71162ef484a23c` |
| `pacifica` | `6415d2d3b78ded6c06fb9138468538cd0d8b4b21c20c85a5106d6c90489579b6` |
| `paradex` | `7fe1b4580e93ec68fd34e1b84e5ae40d683a2113b9df12ecb45de969c2d529f7` |
| `paragon` | `d6d8a2010963132da13b3e18af5a7c566434d8b9e4fbaf910ce2fbb5825f72ce` |
| `qfex` | `0cd696c4f0560298e6eb9d211df6c8954524edf78db0daa27a7fab399d35ac61` |
| `reya` | `f5cb823f3a9f23ed0ae0e355125a25d1309a532de358af38265c49bd0cdddee3` |
| `risex` | `dc31f67b788b0770c549e27ed0539f72b6e3cfddf0e7eef44711dab6149d26a7` |
| `standx` | `33e33f48a9f2aa8ed20afc529b7fa3a3b29439e5724e4bc7951ccbab56e254c2` |
| `tradexyz` | `288f3e3f4003b531238273d9caded8082f9b665a97ad36a540167fc0777b3b63` |
| `txflow` | `ffa45d2b2ad983bd2b679c095d95407257cfaa3c6673e6dc0bcbaa61c03fbf97` |
| `variational` | `853d2e1fc7f8e94ac22955d56fa503d6d7043981914636716ca37b14bd8e766a` |
| `vest` | `33fab2c13a7defa57a691d15638219bfbd95799f1d78b140112014a1a961fc2a` |

## Version 1.6.2 additional exchange icons

Verified on **2026-11-07**. The public reference site declares icons in its linked `defillama-BkMbwNkQ.js` asset; all other new icon URLs come from live CoinGecko or DefiLlama metadata. Source images are decoded and written as static PNG, at most 128 × 128 px, preserving aspect ratio and brand artwork. The Lighter RH independent instance uses the same Lighter brand mark.

| Catalog ID | Local file | Public original | Discovery | SHA-256 of shipped bytes |
| --- | --- | --- | --- | --- |
| `01xyz` | `/perpdex-icons/01xyz.png` | [Image](https://icons.llamao.fi/icons/protocols/01-exchange) | [Public metadata](https://api.llama.fi/protocols) | `209963697b0b41405fe8c7a749676a4e82e627379bb82ed950999eacf52a8b64` |
| `aftermath` | `/perpdex-icons/aftermath.png` | [Image](https://icons.llamao.fi/icons/protocols/aftermath-perps) | [Public metadata](https://api.llama.fi/protocols) | `cc35a2af8da691c02d53fb86c931db969d4d9777fa6bc15ffd5813e66a62de73` |
| `avantis` | `/perpdex-icons/avantis.png` | [Image](https://perpdexlist.com/logos/avantis.png) | [Public metadata](https://perpdexlist.com/assets/defillama-BkMbwNkQ.js) | `02f7abf2f3749b9d07dcf5ea297bba52e940f2c3542fbec2ed842a8a69f88052` |
| `boros` | `/perpdex-icons/boros.png` | [Image](https://icons.llamao.fi/icons/protocols/boros) | [Public metadata](https://api.llama.fi/protocols) | `e1f5d866762eabbea64d48bb1f606c9438f39b77d4f129be55af99e865661a18` |
| `bulk` | `/perpdex-icons/bulk.png` | [Image](https://coin-images.coingecko.com/markets/images/22312/small/bulk.jpg?1784018476) | [Public metadata](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) | `1c17e0424f80a35e8116809e5ed577b7fbacd944df128e1772b651eec9f3ac27` |
| `bullet` | `/perpdex-icons/bullet.png` | [Image](https://icons.llamao.fi/icons/protocols/bullet-perps) | [Public metadata](https://api.llama.fi/protocols) | `8a52f9ff4989e9fc02aa5019aadeb6859706bd19719653a94ca2e3f8cc63f602` |
| `ethereal` | `/perpdex-icons/ethereal.png` | [Image](https://icons.llamao.fi/icons/protocols/meridian-perps) | [Public metadata](https://api.llama.fi/protocols) | `8e8a513f0d7c68ddeacc3ab4145c35797d1d4b5f913e252819282b0c49a4313b` |
| `gains` | `/perpdex-icons/gains.png` | [Image](https://icons.llamao.fi/icons/protocols/gains-network) | [Public metadata](https://api.llama.fi/protocols) | `49e3350ad3dd233c9c0c6d853ed63e286924085f4d6c933610bdeb9c182f85c9` |
| `hello` | `/perpdex-icons/hello.png` | [Image](https://perpdexlist.com/logos/hello.svg) | [Public metadata](https://perpdexlist.com/assets/defillama-BkMbwNkQ.js) | `058b8f9731bfd496b8d47f0d5ad04664cd07f15b391a952c39d4cf22e60c187e` |
| `hibachi` | `/perpdex-icons/hibachi.png` | [Image](https://icons.llamao.fi/icons/protocols/hibachi) | [Public metadata](https://api.llama.fi/protocols) | `9c972e763a8ae2ccfaedc696f7ffe2b1f6bd5b5d6b8c58fd337a727709c1767b` |
| `hotstuff` | `/perpdex-icons/hotstuff.png` | [Image](https://icons.llamao.fi/icons/protocols/hotstuff-perps) | [Public metadata](https://api.llama.fi/protocols) | `687f11050215c5d1978ef3157baad6c8e2c81a1d8f7b37c11afe39207bc47542` |
| `hyena` | `/perpdex-icons/hyena.png` | [Image](https://icons.llamao.fi/icons/protocols/hyena) | [Public metadata](https://api.llama.fi/protocols) | `c68651cff7014309626a21827481f5fc836aeb9bde76b7ca21b8acfadc22ec55` |
| `kalshi` | `/perpdex-icons/kalshi.png` | [Image](https://coin-images.coingecko.com/markets/images/22318/small/Kalshi_App-Icon_%281%29.png?1784510925) | [Public metadata](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) | `73d0658453faef0b05f8657f67e14a8c67355ffcfd33653c72d69bb4a2d9cebc` |
| `katana` | `/perpdex-icons/katana.png` | [Image](https://icons.llamao.fi/icons/protocols/katana-perps) | [Public metadata](https://api.llama.fi/protocols) | `007f4ed849a26b7a0637e6364acf2eeccf07ba3cff6ea8620df6e37a959b95cc` |
| `papertrade` | `/perpdex-icons/papertrade.png` | [Image](https://perpdexlist.com/logos/papertrade.png) | [Public metadata](https://perpdexlist.com/assets/defillama-BkMbwNkQ.js) | `d2d62c10e812b9d7bc02897a2d40a9478caa80f4a46b9c6a08b74e1f8e483154` |
| `perpl` | `/perpdex-icons/perpl.png` | [Image](https://icons.llamao.fi/icons/protocols/perpl) | [Public metadata](https://api.llama.fi/protocols) | `1cde48da3406165eb0c1e5b163c89db4a510e5188adaa2f6f52ef1c4e8e544c9` |
| `phoenix` | `/perpdex-icons/phoenix.png` | [Image](https://coin-images.coingecko.com/markets/images/22397/small/PFP-2.png?1793339190) | [Public metadata](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) | `54f2c9b7f67f9fffa7faa94d9966c0c645ae17b22dc413c27ed64f93d550e7ca` |
| `polymarket` | `/perpdex-icons/polymarket.png` | [Image](https://coin-images.coingecko.com/markets/images/22361/small/polymarket.jpg?1790067515) | [Public metadata](https://api.coingecko.com/api/v3/derivatives/exchanges?per_page=100&page=1) | `907e5488f6d8fb48d43012eb5b14d860b26e3013bf121fc751f36e8bffe0e9b7` |
| `popdex` | `/perpdex-icons/popdex.png` | [Image](https://icons.llamao.fi/icons/protocols/popdex-perps) | [Public metadata](https://api.llama.fi/protocols) | `e6f55d91f4bd31b880e1dc81ad7a1dca9ccaae898feacab3488a4479c7d4ec77` |
| `rho` | `/perpdex-icons/rho.png` | [Image](https://icons.llamao.fi/icons/protocols/rho-x) | [Public metadata](https://api.llama.fi/protocols) | `1e762d1337dce9effa0a2e73442d9749672cd707f5fabbdec0c0033fe41f0235` |
| `lighter-rh` | `/perpdex-icons/lighter.jpg` | [Image](https://coin-images.coingecko.com/markets/images/22097/small/lighter.jpg?1758003181) | [Public metadata](https://docs.robinhood.com/chain/lighter-domains/) | `ee6db8dca698f0782c3cb4514fe68e5e21bb3dc47ea9f02ac69e185ae2ea4d34` |
