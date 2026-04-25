#!/bin/bash
# ─── Velvit Video Upload Test Suite ─────────────────────────────────────────
# Executa validações + uploads reais simulando múltiplos dispositivos/browsers
# Uso: bash test-upload.sh
# ─────────────────────────────────────────────────────────────────────────────

API="https://velvitpaw-1.onrender.com/api/upload-video"
PASS=0; FAIL=0
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  VELVIT · TESTE DE UPLOAD DE VÍDEO"
echo "  $DATE"
echo "══════════════════════════════════════════════════════════"

# ─── Verifica se o servidor está no ar ───────────────────────────────────────
if ! curl -s --max-time 3 "$API" -X POST > /dev/null 2>&1; then
  # A resposta 400 também indica que o servidor está no ar
  :
fi
SERVER_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$API" 2>/dev/null)
if [[ "$SERVER_CHECK" != "400" && "$SERVER_CHECK" != "200" ]]; then
  echo "  ✗ SERVIDOR NÃO ESTÁ RODANDO (HTTP $SERVER_CHECK). Inicie o workflow primeiro."
  exit 1
fi
echo "  ✓ Servidor na porta 3001 está ativo"

# ─── Gera vídeos reais com ffmpeg ────────────────────────────────────────────
echo ""
echo "  Gerando vídeos de teste com ffmpeg..."

ffmpeg -y -f lavfi -i "color=c=blue:size=1280x720:rate=30" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 5 -c:v libx264 -b:v 2000k -c:a aac -shortest \
  /tmp/velvit_test_small.mp4 -loglevel error

ffmpeg -y -f lavfi -i "color=c=red:size=1280x720:rate=30" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 8 -c:v libx264 -b:v 5000k -c:a aac -shortest \
  /tmp/velvit_test_medium.mp4 -loglevel error

echo "  ✓ Vídeos gerados"

run_test() {
  local name="$1" expected_status="$2" expected_pattern="$3" body="$4" code="$5"
  if [[ "$code" == "$expected_status" ]] && echo "$body" | grep -q "$expected_pattern"; then
    echo "  ✓ PASS: $name"; ((PASS++))
  else
    echo "  ✗ FAIL: $name  [HTTP $code → $body]"; ((FAIL++))
  fi
}

run_upload() {
  local label="$1" file="$2" agent="$3"
  local size=$(ls -lh "$file" | awk '{print $5}')
  echo ""
  echo "  ┌─ $label ($size)"
  local resp=$(curl -s -w "\n%{http_code}" -X POST "$API" \
    -H "User-Agent: $agent" \
    -F "file=@$file;type=video/mp4" --max-time 120)
  local body=$(echo "$resp" | sed -n '1p')
  local code=$(echo "$resp" | tail -1)
  local provider=$(echo "$body" | grep -o '"provider":"[^"]*"' | cut -d'"' -f4)
  local url_short=$(echo "$body" | grep -o '"url":"[^"]*"' | cut -d'"' -f4 | cut -c1-60)
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"url"'; then
    echo "  │  ✓ HTTP 200 | Provider: $provider"
    echo "  └─ URL: ${url_short}..."
    ((PASS++))
  else
    echo "  │  ✗ FALHOU | HTTP $code"
    echo "  └─ $body"
    ((FAIL++))
  fi
}

# ─── Validações ───────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  VALIDAÇÕES DO ENDPOINT"
echo "──────────────────────────────────────────────────────────"

resp=$(curl -s -w "\n%{http_code}" -X POST "$API")
run_test "Sem arquivo → 400" "400" "Nenhum arquivo" "$(echo "$resp"|head -1)" "$(echo "$resp"|tail -1)"

resp=$(curl -s -w "\n%{http_code}" -X POST "$API" -F "file=@/tmp/velvit_test_small.mp4;type=image/jpeg")
run_test "MIME image/jpeg → 400" "400" "Tipo de arquivo" "$(echo "$resp"|head -1)" "$(echo "$resp"|tail -1)"

resp=$(curl -s -w "\n%{http_code}" -X POST "$API" -F "file=@/tmp/velvit_test_small.mp4;type=application/pdf")
run_test "MIME application/pdf → 400" "400" "Tipo de arquivo" "$(echo "$resp"|head -1)" "$(echo "$resp"|tail -1)"

# ─── Uploads reais — múltiplos dispositivos ───────────────────────────────────
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  UPLOADS REAIS — MÚLTIPLOS DISPOSITIVOS & BROWSERS"
echo "──────────────────────────────────────────────────────────"

run_upload "Samsung Galaxy S23 · Android Chrome" /tmp/velvit_test_small.mp4 \
  "Mozilla/5.0 (Linux; Android 13; SM-S911B) Chrome/120 Mobile Safari/537.36"

run_upload "iPhone 17 · Safari iOS" /tmp/velvit_test_medium.mp4 \
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148 Safari/604.1"

run_upload "Windows 11 · Firefox" /tmp/velvit_test_small.mp4 \
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Firefox/121.0"

run_upload "MacBook Pro · Chrome" /tmp/velvit_test_medium.mp4 \
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Chrome/120 Safari/537.36"

run_upload "Google Pixel 7 · Chrome Android" /tmp/velvit_test_small.mp4 \
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/119 Mobile Safari/537.36"

run_upload "iPad Pro · Safari" /tmp/velvit_test_medium.mp4 \
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1"

# ─── Resultado ────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo "  ✓ TUDO OK — $PASS/$TOTAL testes passaram"
else
  echo "  ✗ ATENÇÃO — $FAIL/$TOTAL testes falharam (veja acima)"
fi
echo "══════════════════════════════════════════════════════════"
echo ""
