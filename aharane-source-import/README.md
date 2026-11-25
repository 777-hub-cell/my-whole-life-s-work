# Aharane source import

Upload the complete source archive as `source.zip` in this folder on branch `aharane/source-import-20261125`.

The GitHub Actions importer will validate the archive, replace only the `aharane/` source tree and the two Aharane-specific workflows, then commit the extracted files. It removes this staging folder and the temporary importer workflow after a successful import.

Do not upload secrets, `.env` files, signing keys, or `local.properties`.