#!/bin/sh
# Aggiorna il numero di versione in tutti gli import (forza il ricaricamento sui telefoni)
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(from '\./[a-z]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g" js/*.js
sed -i -E "s#(src=\"js/main\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(href=\"css/stile\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#" index.html
sed -i -E "s#^export const VERSIONE = .*#export const VERSIONE = '$V';#" js/geo.js
echo "versione $V"
