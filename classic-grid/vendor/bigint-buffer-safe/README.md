# bigint-buffer safe fallback

This package preserves the public conversion API of `bigint-buffer` while always using its pure-JavaScript implementation. It intentionally removes the vulnerable native binding reported in GHSA-3gc7-fjrx-p6mg. The implementation is derived from `bigint-buffer` 1.1.5 and remains available under Apache-2.0.
