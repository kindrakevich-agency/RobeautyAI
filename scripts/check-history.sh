#!/usr/bin/env bash
# Перевірка історії репозиторію на згадки про інструменти розробки.
#
# Разова перевірка вже підводила: трейлер потрапив в один коміт із 94 і
# спливнув на сторінці учасників GitHub. Тому перевірка автоматична —
# гачок .githooks/commit-msg не пускає такий коміт, а цей скрипт
# перевіряє всю історію перед передачею репозиторію.
#
# refs/original пропускаємо: це резервна копія, яку лишає git filter-branch,
# вона нікуди не відправляється. Прибрати її:
#   git update-ref -d refs/original/refs/heads/main
set -e
BAD=0
for ref in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes); do
  while read -r h; do
    if git log -1 --format='%b%n%an%n%ae%n%cn%n%ce' "$h" \
       | grep -qiE '^(Co-Authored-By|Signed-off-by):.*(claude|anthropic)|^.*Generated with .*Claude|(claude|anthropic)\\.(com|ai)'; then
      echo "✗ $ref  $h  $(git log -1 --format='%s' "$h")"
      BAD=1
    fi
  done < <(git rev-list "$ref")
done
if git for-each-ref --format='%(refname)' | grep -q '^refs/original/'; then
  echo "ℹ лишилася резервна копія filter-branch — на віддалений репозиторій не впливає"
fi
[ "$BAD" -eq 0 ] && echo "✓ історія чиста: $(git rev-list --count HEAD) комітів" || exit 1
