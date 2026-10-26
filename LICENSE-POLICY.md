# Free-use licensing policy

Third-party software used by this project must be under an OSI-approved license
permitting use, modification and redistribution, including commercial use.
Third-party art/audio must likewise permit commercial use, modification and
redistribution. Non-commercial, no-derivatives, evaluation-only, source-available
without these freedoms, and undocumented permissions are not accepted.

Free use does not remove attribution, notice, source-offer or copyleft obligations.
MIT, Apache-2.0, BSD, ISC, 0BSD and LGPL are different licenses; keep their notices
and satisfy the applicable conditions. A license with obligations is not the same
as a fee-charging or non-commercial-only license.

This policy **does not license the owner's game code or original artwork to third
parties**. No project-wide MIT grant is inferred from a public repository or from
this audit request. Such a grant needs the rights holder's explicit decision.
`project-original` in the asset inventory records documented project authorship,
not an open-source license grant or an independent ownership guarantee.

## Review and checks

- `npm run license:check` checks bundled vendor files, license notices, all npm
  lockfile entries (including optional platform packages), and tracked media.
  Unverified media makes the complete check fail.
- `npm run license:dependencies` reports dependency compliance separately. A pass
  in this mode does not clear the original media or license the entire game.
- New or changed vendor files/media require a provenance review and an explicit
  inventory update. Do not mark a file verified just because it is in the repo,
  because it is downloadable, or because an AI tool produced a derivative of it.
- Third-party media also needs creator, original source, license URL and retained
  attribution/change information. CC0, CC BY 4.0 and CC BY-SA 4.0 are accepted for
  media under their respective conditions, not as software-license replacements.
- Preserve license notices in redistributions. The npm build tools are not shipped
  in the static browser game; retain their upstream notices/source provisions if
  distributing a toolchain or native binaries separately.

`licenses/vendor.json` pins reviewed bundled bytes. `licenses/assets.json` pins
reviewed media and records unresolved provenance. `package-lock.json` pins build
dependencies and their registry integrity metadata. These checks prevent unnoticed
inventory drift; they do not replace checking a contributor's actual rights.

See [the audit and outstanding evidence](docs/LICENSE-AUDIT.md).
