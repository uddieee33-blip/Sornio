Relay run log (tail):
```
== uname: Linux runnervm0hi8g 7.0.0-1020-azure #21-Ubuntu SMP PREEMPT Tue Oct 27 22:34:38 UTC 2026 x86_64 GNU/Linux
== python: Python 3.14.4
== cargo: cargo 1.100.0 (3acc79c0c 2026-11-05)
== curl: curl 8.18.0 (x86_64-pc-linux-gnu) libcurl/8.18.0 OpenSSL/3.5.5 zlib/1.3.1 brotli/1.2.0 zstd/1.5.7 libidn2/2.3.8 libpsl/0.21.2 libssh2/1.11.1 nghttp2/1.68.0 librtmp/2.3 mit-krb5/1.22.1 OpenLDAP/2.6.10
== fetching channel manifest
== curl manifest exit: 0
RUST_VERSION=1.100.0 (0ef1bc386 2026-11-09)
downloading rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=f1d0b1dec81dab6f523cd098507763487b0d4bd7fd2c87582f154128719be03b
downloading rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=4591b6486594ded52ecd6135db95bf9355bbd3ca7a380888b141528bbcf9a5d4
downloading cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=7e29ce07d7c6e92d1826870575ba27d57fff6cb3e754aa57d99099cb88fab35d
Traceback (most recent call last):
  File "/home/runner/work/Sornio/Sornio/work/scripts/phase5-fetch-dist.py", line 25, in <module>
    pkg = channel["pkg"][comp]["target"].get(target)
          ~~~~~~~~~~~~~~^^^^^^
KeyError: 'rustfmt'
== dist exit: 1
    Updating crates.io index
 Downloading crates ...
  Downloaded thiserror v2.0.21
  Downloaded quote v1.0.47
  Downloaded thiserror-impl v2.0.21
  Downloaded unicode-ident v1.0.27
  Downloaded vcpkg v0.2.15
  Downloaded syn v3.0.9
  Downloaded proc-macro2 v1.0.107
  Downloaded errno v0.3.14
  Downloaded getrandom v0.4.3
  Downloaded fastrand v2.5.0
  Downloaded zmij v1.0.23
  Downloaded bitflags v2.13.2
  Downloaded cfg-if v1.0.5
  Downloaded crypto-common v0.1.7
  Downloaded cpufeatures v0.2.17
  Downloaded block-buffer v0.10.4
  Downloaded subtle v2.6.1
  Downloaded tempfile v3.27.0
  Downloaded serde_json v1.0.154
  Downloaded memchr v2.8.3
  Downloaded once_cell v1.21.4
  Downloaded digest v0.10.7
  Downloaded fallible-iterator v0.3.0
  Downloaded shlex v2.0.1
  Downloaded cpufeatures v0.3.1
  Downloaded generic-array v0.14.7
  Downloaded version_check v0.9.5
  Downloaded quick-error v1.2.3
  Downloaded rand v0.10.3
  Downloaded itoa v1.0.18
  Downloaded unarray v0.1.4
  Downloaded bit-set v0.11.1
  Downloaded rand_core v0.10.1
  Downloaded sha2 v0.10.9
  Downloaded equivalent v1.0.3
  Downloaded serde v1.0.229
  Downloaded rand_xorshift v0.5.0
  Downloaded proc-macro-crate v3.5.0
  Downloaded foldhash v0.1.5
  Downloaded rand_core v0.6.4
  Downloaded base64ct v1.8.3
  Downloaded cfg_aliases v0.2.2
  Downloaded chacha20 v0.10.2
  Downloaded rustix v1.1.5
  Downloaded autocfg v1.5.1
  Downloaded bit-vec v0.10.1
  Downloaded fallible-streaming-iterator v0.1.9
  Downloaded wait-timeout v0.2.1
  Downloaded pkg-config v0.3.34
  Downloaded fnv v1.0.7
  Downloaded core_detect v1.0.0
  Downloaded borsh v1.8.1
  Downloaded argon2 v0.5.3
  Downloaded toml_parser v1.1.5+spec-1.1.0
  Downloaded password-hash v0.5.0
  Downloaded serde_core v1.0.229
  Downloaded blake2 v0.10.6
  Downloaded toml_datetime v1.1.2+spec-1.1.0
  Downloaded find-msvc-tools v0.1.15
  Downloaded hashlink v0.10.0
  Downloaded rusty-fork v0.3.1
  Downloaded borsh-derive v1.8.1
  Downloaded zeroize v1.9.1
  Downloaded smallvec v1.16.4
  Downloaded typenum v1.20.1
  Downloaded openssl-sys v0.9.117
  Downloaded bytes v1.12.1
  Downloaded num-traits v0.2.19
  Downloaded serde_derive v1.0.229
  Downloaded toml_edit v0.25.17+spec-1.1.0
  Downloaded getrandom v0.3.4
  Downloaded indexmap v2.14.2
  Downloaded cc v1.10.0
  Downloaded winnow v1.0.4
  Downloaded hashbrown v0.15.5
  Downloaded hashbrown v0.17.1
  Downloaded rusqlite v0.37.0
  Downloaded proptest v1.12.0
  Downloaded regex-syntax v0.8.11
  Downloaded libc v0.2.191
  Downloaded linux-raw-sys v0.12.1
  Downloaded libsqlite3-sys v0.35.0
  Downloaded openssl-src v300.6.1+3.6.3
== cargo fetch exit: 0
relayed 83 crate files, all verified against Cargo.lock where listed
CRATES_FETCH_OK
== crates exit: 0
relayed 83 crate files, all verified against Cargo.lock where listed
CRATES_FETCH_OK
== markers: DIST_OK=no CRATES_OK=yes
== relay exit code: 1
== pwd: /home/runner/work/Sornio/Sornio/work
== ls root
total 536
drwxr-xr-x 18 runner runner   4096 Nov 26 12:13 .
drwxr-xr-x  3 runner runner   4096 Nov 26 12:13 ..
-rw-r--r--  1 runner runner   3018 Nov 26 12:13 .env.example
drwxr-xr-x  7 runner runner   4096 Nov 26 12:13 .git
drwxr-xr-x  3 runner runner   4096 Nov 26 12:13 .github
-rw-r--r--  1 runner runner    800 Nov 26 12:13 .gitignore
-rw-r--r--  1 runner runner    678 Nov 26 12:13 AGENTS.md
-rw-r--r--  1 runner runner     11 Nov 26 12:13 CLAUDE.md
-rw-r--r--  1 runner runner  86681 Nov 26 12:13 README.md
drwxr-xr-x  8 runner runner   4096 Nov 26 12:13 app
drwxr-xr-x  4 runner runner   4096 Nov 26 12:13 apps
drwxr-xr-x 24 runner runner   4096 Nov 26 12:13 components
drwxr-xr-x  4 runner runner   4096 Nov 26 12:13 desktop
drwxr-xr-x  6 runner runner   4096 Nov 26 12:13 docs
-rw-r--r--  1 runner runner   1891 Nov 26 12:13 eslint.config.mjs
-rw-r--r--  1 runner runner   2118 Nov 26 12:13 instrumentation.ts
drwxr-xr-x 20 runner runner   4096 Nov 26 12:13 lib
drwxr-xr-x  2 runner runner   4096 Nov 26 12:13 locales
drwxr-xr-x  3 runner runner   4096 Nov 26 12:13 mobile
-rw-r--r--  1 runner runner    288 Nov 26 12:13 next-env.d.ts
-rw-r--r--  1 runner runner   9729 Nov 26 12:13 next.config.js
-rw-r--r--  1 runner runner 275898 Nov 26 12:13 package-lock.json
-rw-r--r--  1 runner runner   4794 Nov 26 12:13 package.json
drwxr-xr-x  7 runner runner   4096 Nov 26 12:13 packages
drwxr-xr-x  2 runner runner   4096 Nov 26 12:13 phase5-relay
-rw-r--r--  1 runner runner   4564 Nov 26 12:13 phase5-relay-run.log
-rw-r--r--  1 runner runner    495 Nov 26 12:13 postcss.config.js
-rw-r--r--  1 runner runner  21536 Nov 26 12:13 proxy.ts
drwxr-xr-x  5 runner runner   4096 Nov 26 12:13 public
drwxr-xr-x  4 runner runner   4096 Nov 26 12:13 relay
drwxr-xr-x  2 runner runner   4096 Nov 26 12:13 scripts
drwxr-xr-x  3 runner runner   4096 Nov 26 12:13 supabase
-rw-r--r--  1 runner runner  10474 Nov 26 12:13 tailwind.config.ts
-rw-r--r--  1 runner runner    739 Nov 26 12:13 tsconfig.json
-rw-r--r--  1 runner runner    122 Nov 26 12:13 vercel.json
== ls relay
/home/runner/work/Sornio/Sornio/work/relay:
total 892
drwxr-xr-x  4 runner runner   4096 Nov 26 12:13 .
drwxr-xr-x 18 runner runner   4096 Nov 26 12:13 ..
-rw-r--r--  1 runner runner      0 Nov 26 12:13 CRATES_OK
-rw-r--r--  1 runner runner 893976 Nov 26 12:13 channel-rust-stable.toml
drwxr-xr-x  2 runner runner   4096 Nov 26 12:13 crates
drwxr-xr-x  2 runner runner   4096 Nov 26 12:13 payload

/home/runner/work/Sornio/Sornio/work/relay/crates:
total 20772
drwxr-xr-x 2 runner runner    4096 Nov 26 12:13 .
drwxr-xr-x 4 runner runner    4096 Nov 26 12:13 ..
-rw-r--r-- 1 runner runner   28795 Nov 26 12:13 argon2-0.5.3.crate
-rw-r--r-- 1 runner runner   18911 Nov 26 12:13 autocfg-1.5.1.crate
-rw-r--r-- 1 runner runner   32227 Nov 26 12:13 base64ct-1.8.3.crate
-rw-r--r-- 1 runner runner   19997 Nov 26 12:13 bit-set-0.11.1.crate
-rw-r--r-- 1 runner runner   30095 Nov 26 12:13 bit-vec-0.10.1.crate
-rw-r--r-- 1 runner runner   51678 Nov 26 12:13 bitflags-2.13.2.crate
-rw-r--r-- 1 runner runner   47234 Nov 26 12:13 blake2-0.10.6.crate
-rw-r--r-- 1 runner runner   10538 Nov 26 12:13 block-buffer-0.10.4.crate
-rw-r--r-- 1 runner runner   85266 Nov 26 12:13 borsh-1.8.1.crate
-rw-r--r-- 1 runner runner   33529 Nov 26 12:13 borsh-derive-1.8.1.crate
-rw-r--r-- 1 runner runner   75667 Nov 26 12:13 bytes-1.12.1.crate
-rw-r--r-- 1 runner runner  148443 Nov 26 12:13 cc-1.10.0.crate
-rw-r--r-- 1 runner runner    9578 Nov 26 12:13 cfg-if-1.0.5.crate
-rw-r--r-- 1 runner runner    6527 Nov 26 12:13 cfg_aliases-0.2.2.crate
-rw-r--r-- 1 runner runner   38197 Nov 26 12:13 chacha20-0.10.2.crate
-rw-r--r-- 1 runner runner   17758 Nov 26 12:13 core_detect-1.0.0.crate
-rw-r--r-- 1 runner runner   13466 Nov 26 12:13 cpufeatures-0.2.17.crate
-rw-r--r-- 1 runner runner   14272 Nov 26 12:13 cpufeatures-0.3.1.crate
-rw-r--r-- 1 runner runner    9619 Nov 26 12:13 crypto-common-0.1.7.crate
-rw-r--r-- 1 runner runner   19557 Nov 26 12:13 digest-0.10.7.crate
-rw-r--r-- 1 runner runner    7495 Nov 26 12:13 equivalent-1.0.3.crate
-rw-r--r-- 1 runner runner   12002 Nov 26 12:13 errno-0.3.14.crate
-rw-r--r-- 1 runner runner   19639 Nov 26 12:13 fallible-iterator-0.3.0.crate
-rw-r--r-- 1 runner runner    9249 Nov 26 12:13 fallible-streaming-iterator-0.1.9.crate
-rw-r--r-- 1 runner runner   20782 Nov 26 12:13 fastrand-2.5.0.crate
-rw-r--r-- 1 runner runner   31634 Nov 26 12:13 find-msvc-tools-0.1.15.crate
-rw-r--r-- 1 runner runner   11266 Nov 26 12:13 fnv-1.0.7.crate
-rw-r--r-- 1 runner runner   21901 Nov 26 12:13 foldhash-0.1.5.crate
-rw-r--r-- 1 runner runner   15950 Nov 26 12:13 generic-array-0.14.7.crate
-rw-r--r-- 1 runner runner   50932 Nov 26 12:13 getrandom-0.3.4.crate
-rw-r--r-- 1 runner runner   52437 Nov 26 12:13 getrandom-0.4.3.crate
-rw-r--r-- 1 runner runner  140908 Nov 26 12:13 hashbrown-0.15.5.crate
-rw-r--r-- 1 runner runner  155512 Nov 26 12:13 hashbrown-0.17.1.crate
-rw-r--r-- 1 runner runner   29402 Nov 26 12:13 hashlink-0.10.0.crate
-rw-r--r-- 1 runner runner  103014 Nov 26 12:13 indexmap-2.14.2.crate
-rw-r--r-- 1 runner runner   15935 Nov 26 12:13 itoa-1.0.18.crate
-rw-r--r-- 1 runner runner  855401 Nov 26 12:13 libc-0.2.191.crate
-rw-r--r-- 1 runner runner 5200364 Nov 26 12:13 libsqlite3-sys-0.35.0.crate
-rw-r--r-- 1 runner runner 3006116 Nov 26 12:13 linux-raw-sys-0.12.1.crate
-rw-r--r-- 1 runner runner   99165 Nov 26 12:13 memchr-2.8.3.crate
-rw-r--r-- 1 runner runner   51631 Nov 26 12:13 num-traits-0.2.19.crate
-rw-r--r-- 1 runner runner   35010 Nov 26 12:13 once_cell-1.21.4.crate
-rw-r--r-- 1 runner runner 7195821 Nov 26 12:13 openssl-src-300.6.1+3.6.3.crate
-rw-r--r-- 1 runner runner   76045 Nov 26 12:13 openssl-sys-0.9.117.crate
-rw-r--r-- 1 runner runner   26884 Nov 26 12:13 password-hash-0.5.0.crate
-rw-r--r-- 1 runner runner   21370 Nov 26 12:13 pkg-config-0.3.34.crate
-rw-r--r-- 1 runner runner   12709 Nov 26 12:13 proc-macro-crate-3.5.0.crate
-rw-r--r-- 1 runner runner   59588 Nov 26 12:13 proc-macro2-1.0.107.crate
-rw-r--r-- 1 runner runner  213842 Nov 26 12:13 proptest-1.12.0.crate
-rw-r--r-- 1 runner runner   15066 Nov 26 12:13 quick-error-1.2.3.crate
-rw-r--r-- 1 runner runner   31622 Nov 26 12:13 quote-1.0.47.crate
-rw-r--r-- 1 runner runner  105994 Nov 26 12:13 rand-0.10.3.crate
-rw-r--r-- 1 runner runner   22833 Nov 26 12:13 rand_core-0.10.1.crate
-rw-r--r-- 1 runner runner   22666 Nov 26 12:13 rand_core-0.6.4.crate
-rw-r--r-- 1 runner runner   10371 Nov 26 12:13 rand_xorshift-0.5.0.crate
-rw-r--r-- 1 runner runner  359055 Nov 26 12:13 regex-syntax-0.8.11.crate
-rw-r--r-- 1 runner runner  169975 Nov 26 12:13 rusqlite-0.37.0.crate
-rw-r--r-- 1 runner runner  425681 Nov 26 12:13 rustix-1.1.5.crate
-rw-r--r-- 1 runner runner   21108 Nov 26 12:13 rusty-fork-0.3.1.crate
-rw-r--r-- 1 runner runner   83669 Nov 26 12:13 serde-1.0.229.crate
-rw-r--r-- 1 runner runner   63100 Nov 26 12:13 serde_core-1.0.229.crate
-rw-r--r-- 1 runner runner   59864 Nov 26 12:13 serde_derive-1.0.229.crate
-rw-r--r-- 1 runner runner  158079 Nov 26 12:13 serde_json-1.0.154.crate
-rw-r--r-- 1 runner runner   29271 Nov 26 12:13 sha2-0.10.9.crate
-rw-r--r-- 1 runner runner   19332 Nov 26 12:13 shlex-2.0.1.crate
-rw-r--r-- 1 runner runner   34822 Nov 26 12:13 smallvec-1.16.4.crate
-rw-r--r-- 1 runner runner   14562 Nov 26 12:13 subtle-2.6.1.crate
-rw-r--r-- 1 runner runner  313970 Nov 26 12:13 syn-3.0.9.crate
-rw-r--r-- 1 runner runner   44780 Nov 26 12:13 tempfile-3.27.0.crate
-rw-r--r-- 1 runner runner   29021 Nov 26 12:13 thiserror-2.0.21.crate
-rw-r--r-- 1 runner runner   21637 Nov 26 12:13 thiserror-impl-2.0.21.crate
-rw-r--r-- 1 runner runner   18204 Nov 26 12:13 toml_datetime-1.1.2+spec-1.1.0.crate
-rw-r--r-- 1 runner runner   68812 Nov 26 12:13 toml_edit-0.25.17+spec-1.1.0.crate
-rw-r--r-- 1 runner runner   36159 Nov 26 12:13 toml_parser-1.1.5+spec-1.1.0.crate
-rw-r--r-- 1 runner runner  105479 Nov 26 12:13 typenum-1.20.1.crate
-rw-r--r-- 1 runner runner   12895 Nov 26 12:13 unarray-0.1.4.crate
-rw-r--r-- 1 runner runner   48807 Nov 26 12:13 unicode-ident-1.0.27.crate
-rw-r--r-- 1 runner runner  228735 Nov 26 12:13 vcpkg-0.2.15.crate
-rw-r--r-- 1 runner runner   15554 Nov 26 12:13 version_check-0.9.5.crate
-rw-r--r-- 1 runner runner   11435 Nov 26 12:13 wait-timeout-0.2.1.crate
-rw-r--r-- 1 runner runner  188513 Nov 26 12:13 winnow-1.0.4.crate
-rw-r--r-- 1 runner runner   25043 Nov 26 12:13 zeroize-1.9.1.crate
-rw-r--r-- 1 runner runner   28612 Nov 26 12:13 zmij-1.0.23.crate

/home/runner/work/Sornio/Sornio/work/relay/payload:
total 124220
drwxr-xr-x 2 runner runner     4096 Nov 26 12:13 .
drwxr-xr-x 4 runner runner     4096 Nov 26 12:13 ..
-rw-r--r-- 1 runner runner 10946408 Nov 26 12:13 cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner 31283108 Nov 26 12:13 rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner 84955936 Nov 26 12:13 rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz
On branch arena/76ac88ca-sornio
Your branch is up to date with 'origin/arena/76ac88ca-sornio'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	relay/

nothing added to commit but untracked files present (use "git add" to track)
Everything up-to-date
== push exit: 0

```
Relay run log (tail):
```
== uname: Linux runnervm0hi8g 7.0.0-1020-azure #21-Ubuntu SMP PREEMPT Tue Oct 27 22:34:38 UTC 2026 x86_64 GNU/Linux
== python: Python 3.14.4
== cargo: cargo 1.100.0 (3acc79c0c 2026-11-05)
== curl: curl 8.18.0 (x86_64-pc-linux-gnu) libcurl/8.18.0 OpenSSL/3.5.5 zlib/1.3.1 brotli/1.2.0 zstd/1.5.7 libidn2/2.3.8 libpsl/0.21.2 libssh2/1.11.1 nghttp2/1.68.0 librtmp/2.3 mit-krb5/1.22.1 OpenLDAP/2.6.10
== fetching channel manifest
== curl manifest exit: 0
RUST_VERSION=1.100.0 (0ef1bc386 2026-11-09)
downloading rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=f1d0b1dec81dab6f523cd098507763487b0d4bd7fd2c87582f154128719be03b
downloading rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=4591b6486594ded52ecd6135db95bf9355bbd3ca7a380888b141528bbcf9a5d4
downloading cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=7e29ce07d7c6e92d1826870575ba27d57fff6cb3e754aa57d99099cb88fab35d
downloading rustfmt-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/rustfmt-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified rustfmt-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=4c9389e4722b16499e5d47d89837ec84a4ef755f105ed2a84c038156064e01ab
downloading clippy-1.100.0-x86_64-unknown-linux-gnu.tar.xz from https://static.rust-lang.org/dist/2026-11-12/clippy-1.100.0-x86_64-unknown-linux-gnu.tar.xz
verified clippy-1.100.0-x86_64-unknown-linux-gnu.tar.xz sha256=0d18df3bff6c852ef8243727fed075ecb33dbf93b8ab8c138c2f45e3f270102a
DIST_FETCH_OK
== dist exit: 0
    Updating crates.io index
 Downloading crates ...
  Downloaded errno v0.3.14
  Downloaded thiserror v2.0.21
  Downloaded quote v1.0.47
  Downloaded thiserror-impl v2.0.21
  Downloaded unicode-ident v1.0.27
  Downloaded cfg-if v1.0.5
  Downloaded crypto-common v0.1.7
  Downloaded fallible-streaming-iterator v0.1.9
  Downloaded cpufeatures v0.2.17
  Downloaded cpufeatures v0.3.1
  Downloaded cfg_aliases v0.2.2
  Downloaded subtle v2.6.1
  Downloaded rand_xorshift v0.5.0
  Downloaded wait-timeout v0.2.1
  Downloaded block-buffer v0.10.4
  Downloaded generic-array v0.14.7
  Downloaded unarray v0.1.4
  Downloaded equivalent v1.0.3
  Downloaded quick-error v1.2.3
  Downloaded proc-macro-crate v3.5.0
  Downloaded version_check v0.9.5
  Downloaded shlex v2.0.1
  Downloaded fallible-iterator v0.3.0
  Downloaded fnv v1.0.7
  Downloaded rand_core v0.10.1
  Downloaded digest v0.10.7
  Downloaded itoa v1.0.18
  Downloaded autocfg v1.5.1
  Downloaded sha2 v0.10.9
  Downloaded rusty-fork v0.3.1
  Downloaded bit-set v0.11.1
  Downloaded proc-macro2 v1.0.107
  Downloaded tempfile v3.27.0
  Downloaded password-hash v0.5.0
  Downloaded rand_core v0.6.4
  Downloaded toml_datetime v1.1.2+spec-1.1.0
  Downloaded zeroize v1.9.1
  Downloaded argon2 v0.5.3
  Downloaded zmij v1.0.23
  Downloaded bit-vec v0.10.1
  Downloaded core_detect v1.0.0
  Downloaded base64ct v1.8.3
  Downloaded smallvec v1.16.4
  Downloaded foldhash v0.1.5
  Downloaded blake2 v0.10.6
  Downloaded once_cell v1.21.4
  Downloaded pkg-config v0.3.34
  Downloaded borsh-derive v1.8.1
  Downloaded fastrand v2.5.0
  Downloaded find-msvc-tools v0.1.15
  Downloaded serde_core v1.0.229
  Downloaded hashlink v0.10.0
  Downloaded bitflags v2.13.2
  Downloaded num-traits v0.2.19
  Downloaded chacha20 v0.10.2
  Downloaded serde_derive v1.0.229
  Downloaded getrandom v0.3.4
  Downloaded getrandom v0.4.3
  Downloaded openssl-sys v0.9.117
  Downloaded bytes v1.12.1
  Downloaded toml_edit v0.25.17+spec-1.1.0
  Downloaded toml_parser v1.1.5+spec-1.1.0
  Downloaded memchr v2.8.3
  Downloaded borsh v1.8.1
  Downloaded rand v0.10.3
  Downloaded serde v1.0.229
  Downloaded indexmap v2.14.2
  Downloaded typenum v1.20.1
  Downloaded cc v1.10.0
  Downloaded hashbrown v0.15.5
  Downloaded serde_json v1.0.154
  Downloaded hashbrown v0.17.1
  Downloaded winnow v1.0.4
  Downloaded rusqlite v0.37.0
  Downloaded proptest v1.12.0
  Downloaded vcpkg v0.2.15
  Downloaded syn v3.0.9
  Downloaded regex-syntax v0.8.11
  Downloaded rustix v1.1.5
  Downloaded libc v0.2.191
  Downloaded linux-raw-sys v0.12.1
  Downloaded libsqlite3-sys v0.35.0
  Downloaded openssl-src v300.6.1+3.6.3
== cargo fetch exit: 0
relayed 83 crate files, all verified against Cargo.lock where listed
CRATES_FETCH_OK
== crates exit: 0
DIST_OK
relayed 83 crate files, all verified against Cargo.lock where listed
CRATES_FETCH_OK
== markers: DIST_OK=yes CRATES_OK=yes
== relay exit code: 0
== pwd: /home/runner/work/Sornio/Sornio/work
== ls root
total 536
drwxr-xr-x 18 runner runner   4096 Nov 26 12:14 .
drwxr-xr-x  3 runner runner   4096 Nov 26 12:14 ..
-rw-r--r--  1 runner runner   3018 Nov 26 12:14 .env.example
drwxr-xr-x  7 runner runner   4096 Nov 26 12:14 .git
drwxr-xr-x  3 runner runner   4096 Nov 26 12:14 .github
-rw-r--r--  1 runner runner    800 Nov 26 12:14 .gitignore
-rw-r--r--  1 runner runner    678 Nov 26 12:14 AGENTS.md
-rw-r--r--  1 runner runner     11 Nov 26 12:14 CLAUDE.md
-rw-r--r--  1 runner runner  86681 Nov 26 12:14 README.md
drwxr-xr-x  8 runner runner   4096 Nov 26 12:14 app
drwxr-xr-x  4 runner runner   4096 Nov 26 12:14 apps
drwxr-xr-x 24 runner runner   4096 Nov 26 12:14 components
drwxr-xr-x  4 runner runner   4096 Nov 26 12:14 desktop
drwxr-xr-x  6 runner runner   4096 Nov 26 12:14 docs
-rw-r--r--  1 runner runner   1891 Nov 26 12:14 eslint.config.mjs
-rw-r--r--  1 runner runner   2118 Nov 26 12:14 instrumentation.ts
drwxr-xr-x 20 runner runner   4096 Nov 26 12:14 lib
drwxr-xr-x  2 runner runner   4096 Nov 26 12:14 locales
drwxr-xr-x  3 runner runner   4096 Nov 26 12:14 mobile
-rw-r--r--  1 runner runner    288 Nov 26 12:14 next-env.d.ts
-rw-r--r--  1 runner runner   9729 Nov 26 12:14 next.config.js
-rw-r--r--  1 runner runner 275898 Nov 26 12:14 package-lock.json
-rw-r--r--  1 runner runner   4794 Nov 26 12:14 package.json
drwxr-xr-x  7 runner runner   4096 Nov 26 12:14 packages
drwxr-xr-x  2 runner runner   4096 Nov 26 12:14 phase5-relay
-rw-r--r--  1 runner runner   4922 Nov 26 12:14 phase5-relay-run.log
-rw-r--r--  1 runner runner    495 Nov 26 12:14 postcss.config.js
-rw-r--r--  1 runner runner  21536 Nov 26 12:14 proxy.ts
drwxr-xr-x  5 runner runner   4096 Nov 26 12:14 public
drwxr-xr-x  4 runner runner   4096 Nov 26 12:14 relay
drwxr-xr-x  2 runner runner   4096 Nov 26 12:14 scripts
drwxr-xr-x  3 runner runner   4096 Nov 26 12:14 supabase
-rw-r--r--  1 runner runner  10474 Nov 26 12:14 tailwind.config.ts
-rw-r--r--  1 runner runner    739 Nov 26 12:14 tsconfig.json
-rw-r--r--  1 runner runner    122 Nov 26 12:14 vercel.json
== ls relay
/home/runner/work/Sornio/Sornio/work/relay:
total 896
drwxr-xr-x  4 runner runner   4096 Nov 26 12:14 .
drwxr-xr-x 18 runner runner   4096 Nov 26 12:14 ..
-rw-r--r--  1 runner runner      0 Nov 26 12:14 CRATES_OK
-rw-r--r--  1 runner runner      0 Nov 26 12:14 DIST_OK
-rw-r--r--  1 runner runner 893976 Nov 26 12:14 channel-rust-stable.toml
drwxr-xr-x  2 runner runner   4096 Nov 26 12:14 crates
-rw-r--r--  1 runner runner   1825 Nov 26 12:14 manifest.json
drwxr-xr-x  2 runner runner   4096 Nov 26 12:14 payload

/home/runner/work/Sornio/Sornio/work/relay/crates:
total 20772
drwxr-xr-x 2 runner runner    4096 Nov 26 12:14 .
drwxr-xr-x 4 runner runner    4096 Nov 26 12:14 ..
-rw-r--r-- 1 runner runner   28795 Nov 26 12:14 argon2-0.5.3.crate
-rw-r--r-- 1 runner runner   18911 Nov 26 12:14 autocfg-1.5.1.crate
-rw-r--r-- 1 runner runner   32227 Nov 26 12:14 base64ct-1.8.3.crate
-rw-r--r-- 1 runner runner   19997 Nov 26 12:14 bit-set-0.11.1.crate
-rw-r--r-- 1 runner runner   30095 Nov 26 12:14 bit-vec-0.10.1.crate
-rw-r--r-- 1 runner runner   51678 Nov 26 12:14 bitflags-2.13.2.crate
-rw-r--r-- 1 runner runner   47234 Nov 26 12:14 blake2-0.10.6.crate
-rw-r--r-- 1 runner runner   10538 Nov 26 12:14 block-buffer-0.10.4.crate
-rw-r--r-- 1 runner runner   85266 Nov 26 12:14 borsh-1.8.1.crate
-rw-r--r-- 1 runner runner   33529 Nov 26 12:14 borsh-derive-1.8.1.crate
-rw-r--r-- 1 runner runner   75667 Nov 26 12:14 bytes-1.12.1.crate
-rw-r--r-- 1 runner runner  148443 Nov 26 12:14 cc-1.10.0.crate
-rw-r--r-- 1 runner runner    9578 Nov 26 12:14 cfg-if-1.0.5.crate
-rw-r--r-- 1 runner runner    6527 Nov 26 12:14 cfg_aliases-0.2.2.crate
-rw-r--r-- 1 runner runner   38197 Nov 26 12:14 chacha20-0.10.2.crate
-rw-r--r-- 1 runner runner   17758 Nov 26 12:14 core_detect-1.0.0.crate
-rw-r--r-- 1 runner runner   13466 Nov 26 12:14 cpufeatures-0.2.17.crate
-rw-r--r-- 1 runner runner   14272 Nov 26 12:14 cpufeatures-0.3.1.crate
-rw-r--r-- 1 runner runner    9619 Nov 26 12:14 crypto-common-0.1.7.crate
-rw-r--r-- 1 runner runner   19557 Nov 26 12:14 digest-0.10.7.crate
-rw-r--r-- 1 runner runner    7495 Nov 26 12:14 equivalent-1.0.3.crate
-rw-r--r-- 1 runner runner   12002 Nov 26 12:14 errno-0.3.14.crate
-rw-r--r-- 1 runner runner   19639 Nov 26 12:14 fallible-iterator-0.3.0.crate
-rw-r--r-- 1 runner runner    9249 Nov 26 12:14 fallible-streaming-iterator-0.1.9.crate
-rw-r--r-- 1 runner runner   20782 Nov 26 12:14 fastrand-2.5.0.crate
-rw-r--r-- 1 runner runner   31634 Nov 26 12:14 find-msvc-tools-0.1.15.crate
-rw-r--r-- 1 runner runner   11266 Nov 26 12:14 fnv-1.0.7.crate
-rw-r--r-- 1 runner runner   21901 Nov 26 12:14 foldhash-0.1.5.crate
-rw-r--r-- 1 runner runner   15950 Nov 26 12:14 generic-array-0.14.7.crate
-rw-r--r-- 1 runner runner   50932 Nov 26 12:14 getrandom-0.3.4.crate
-rw-r--r-- 1 runner runner   52437 Nov 26 12:14 getrandom-0.4.3.crate
-rw-r--r-- 1 runner runner  140908 Nov 26 12:14 hashbrown-0.15.5.crate
-rw-r--r-- 1 runner runner  155512 Nov 26 12:14 hashbrown-0.17.1.crate
-rw-r--r-- 1 runner runner   29402 Nov 26 12:14 hashlink-0.10.0.crate
-rw-r--r-- 1 runner runner  103014 Nov 26 12:14 indexmap-2.14.2.crate
-rw-r--r-- 1 runner runner   15935 Nov 26 12:14 itoa-1.0.18.crate
-rw-r--r-- 1 runner runner  855401 Nov 26 12:14 libc-0.2.191.crate
-rw-r--r-- 1 runner runner 5200364 Nov 26 12:14 libsqlite3-sys-0.35.0.crate
-rw-r--r-- 1 runner runner 3006116 Nov 26 12:14 linux-raw-sys-0.12.1.crate
-rw-r--r-- 1 runner runner   99165 Nov 26 12:14 memchr-2.8.3.crate
-rw-r--r-- 1 runner runner   51631 Nov 26 12:14 num-traits-0.2.19.crate
-rw-r--r-- 1 runner runner   35010 Nov 26 12:14 once_cell-1.21.4.crate
-rw-r--r-- 1 runner runner 7195821 Nov 26 12:14 openssl-src-300.6.1+3.6.3.crate
-rw-r--r-- 1 runner runner   76045 Nov 26 12:14 openssl-sys-0.9.117.crate
-rw-r--r-- 1 runner runner   26884 Nov 26 12:14 password-hash-0.5.0.crate
-rw-r--r-- 1 runner runner   21370 Nov 26 12:14 pkg-config-0.3.34.crate
-rw-r--r-- 1 runner runner   12709 Nov 26 12:14 proc-macro-crate-3.5.0.crate
-rw-r--r-- 1 runner runner   59588 Nov 26 12:14 proc-macro2-1.0.107.crate
-rw-r--r-- 1 runner runner  213842 Nov 26 12:14 proptest-1.12.0.crate
-rw-r--r-- 1 runner runner   15066 Nov 26 12:14 quick-error-1.2.3.crate
-rw-r--r-- 1 runner runner   31622 Nov 26 12:14 quote-1.0.47.crate
-rw-r--r-- 1 runner runner  105994 Nov 26 12:14 rand-0.10.3.crate
-rw-r--r-- 1 runner runner   22833 Nov 26 12:14 rand_core-0.10.1.crate
-rw-r--r-- 1 runner runner   22666 Nov 26 12:14 rand_core-0.6.4.crate
-rw-r--r-- 1 runner runner   10371 Nov 26 12:14 rand_xorshift-0.5.0.crate
-rw-r--r-- 1 runner runner  359055 Nov 26 12:14 regex-syntax-0.8.11.crate
-rw-r--r-- 1 runner runner  169975 Nov 26 12:14 rusqlite-0.37.0.crate
-rw-r--r-- 1 runner runner  425681 Nov 26 12:14 rustix-1.1.5.crate
-rw-r--r-- 1 runner runner   21108 Nov 26 12:14 rusty-fork-0.3.1.crate
-rw-r--r-- 1 runner runner   83669 Nov 26 12:14 serde-1.0.229.crate
-rw-r--r-- 1 runner runner   63100 Nov 26 12:14 serde_core-1.0.229.crate
-rw-r--r-- 1 runner runner   59864 Nov 26 12:14 serde_derive-1.0.229.crate
-rw-r--r-- 1 runner runner  158079 Nov 26 12:14 serde_json-1.0.154.crate
-rw-r--r-- 1 runner runner   29271 Nov 26 12:14 sha2-0.10.9.crate
-rw-r--r-- 1 runner runner   19332 Nov 26 12:14 shlex-2.0.1.crate
-rw-r--r-- 1 runner runner   34822 Nov 26 12:14 smallvec-1.16.4.crate
-rw-r--r-- 1 runner runner   14562 Nov 26 12:14 subtle-2.6.1.crate
-rw-r--r-- 1 runner runner  313970 Nov 26 12:14 syn-3.0.9.crate
-rw-r--r-- 1 runner runner   44780 Nov 26 12:14 tempfile-3.27.0.crate
-rw-r--r-- 1 runner runner   29021 Nov 26 12:14 thiserror-2.0.21.crate
-rw-r--r-- 1 runner runner   21637 Nov 26 12:14 thiserror-impl-2.0.21.crate
-rw-r--r-- 1 runner runner   18204 Nov 26 12:14 toml_datetime-1.1.2+spec-1.1.0.crate
-rw-r--r-- 1 runner runner   68812 Nov 26 12:14 toml_edit-0.25.17+spec-1.1.0.crate
-rw-r--r-- 1 runner runner   36159 Nov 26 12:14 toml_parser-1.1.5+spec-1.1.0.crate
-rw-r--r-- 1 runner runner  105479 Nov 26 12:14 typenum-1.20.1.crate
-rw-r--r-- 1 runner runner   12895 Nov 26 12:14 unarray-0.1.4.crate
-rw-r--r-- 1 runner runner   48807 Nov 26 12:14 unicode-ident-1.0.27.crate
-rw-r--r-- 1 runner runner  228735 Nov 26 12:14 vcpkg-0.2.15.crate
-rw-r--r-- 1 runner runner   15554 Nov 26 12:14 version_check-0.9.5.crate
-rw-r--r-- 1 runner runner   11435 Nov 26 12:14 wait-timeout-0.2.1.crate
-rw-r--r-- 1 runner runner  188513 Nov 26 12:14 winnow-1.0.4.crate
-rw-r--r-- 1 runner runner   25043 Nov 26 12:14 zeroize-1.9.1.crate
-rw-r--r-- 1 runner runner   28612 Nov 26 12:14 zmij-1.0.23.crate

/home/runner/work/Sornio/Sornio/work/relay/payload:
total 131916
drwxr-xr-x 2 runner runner     4096 Nov 26 12:14 .
drwxr-xr-x 4 runner runner     4096 Nov 26 12:14 ..
-rw-r--r-- 1 runner runner 10946408 Nov 26 12:14 cargo-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner  5353304 Nov 26 12:14 clippy-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner 31283108 Nov 26 12:14 rust-std-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner 84955936 Nov 26 12:14 rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz
-rw-r--r-- 1 runner runner  2524496 Nov 26 12:14 rustfmt-1.100.0-x86_64-unknown-linux-gnu.tar.xz
[arena/76ac88ca-sornio 8ca7183] chore(phase5): relay payload/diagnostics (temporary)
 6 files changed, 44 insertions(+)
 create mode 100644 phase5-relay/chunk-00
 create mode 100644 phase5-relay/chunk-01
 create mode 100644 phase5-relay/chunk-02
 create mode 100644 phase5-relay/chunk-03
 create mode 100644 phase5-relay/manifest.json
 create mode 100644 phase5-relay/payload.tar.sha256
To https://github.com/uddieee33-blip/Sornio
   5f2bf12..8ca7183  HEAD -> arena/76ac88ca-sornio
== push exit: 0

```
