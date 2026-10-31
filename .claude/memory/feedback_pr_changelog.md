---
name: feedback_pr_changelog
description: Siempre actualizar el CHANGELOG a una nueva versión semver antes de crear un PR a develop o main
metadata:
  type: feedback
---

Antes de crear cualquier PR a `develop` o `main`, siempre actualizar `CHANGELOG.md` con la nueva versión semver correspondiente (patch/minor/major según el tipo de cambio).

**Why:** El usuario lo pidió explícitamente para no tener que recordarlo en cada PR.

**How to apply:** Al recibir el pedido "armar el PR a develop/main", revisar la última versión en CHANGELOG.md, determinar la siguiente versión, actualizar el archivo con una entrada nueva que documente los cambios del branch, y luego proceder con el commit y la creación del PR.
