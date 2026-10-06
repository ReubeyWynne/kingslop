(function (root) {
  'use strict';
  var ALIASES = {
    helm: /\b(helm(?:et)?|faceplate|armet)\b/i,
    gloves: /\b(gloves?|bracers?|gauntlets?)\b/i,
    chest: /\b(chest|shroud|leatherwear|breastplate|armor|armour)\b/i,
    boots: /\b(boots?|greaves|riders)\b/i
  };
  function parse(items) {
    var boxes = (items || []).map(function (item) {
      var text = String(item.text || '').trim(), points = item.poly || item.box || item.points || [];
      var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
      return { text: text, x: xs.length ? Math.min.apply(null, xs) : 0, y: ys.length ? (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 : 0, h: ys.length ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : 20 };
    }).filter(function (b) { return b.text; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var rows = [];
    boxes.forEach(function (box) {
      var row = rows[rows.length - 1];
      if (row && Math.abs(row.y - box.y) < Math.max(5, Math.min(row.h, box.h) * 0.65)) row.boxes.push(box);
      else rows.push({ y: box.y, h: box.h, boxes: [box] });
    });
    var lines = rows.map(function (row) { return row.boxes.sort(function (a, b) { return a.x - b.x; }).map(function (b) { return b.text; }).join(' '); });
    var full = lines.join('\n'), out = { level: null, mastery: null, quality: null, slot: null, troop: null, text: full };
    Object.keys(ALIASES).forEach(function (slot) { if (ALIASES[slot].test(full)) out.slot = out.slot ? 'ambiguous' : slot; });
    if (out.slot === 'ambiguous') out.slot = null;
    if (/\binfantry\b/i.test(full)) out.troop = 'inf';
    else if (/\bcavalry\b/i.test(full)) out.troop = 'cav';
    else if (/\b(archer|archery)\b/i.test(full)) out.troop = 'arc';
    if (/\b(red|ascended)\b/i.test(full)) out.quality = 'red';
    else if (/\bmythic\b/i.test(full)) out.quality = 'mythic';
    else if (/\bepic\b/i.test(full)) out.quality = 'epic';
    lines.forEach(function (line) {
      var mastery = line.match(/(?:mastery|forge\s*(?:level|mastery))\s*(?:lv\.?|level)?\s*[:+\-]?\s*(\d{1,2})(?!\d)/i);
      if (mastery && Number(mastery[1]) <= 20 && !/→|->/.test(line)) out.mastery = Number(mastery[1]);
      if (/mastery|forge|\d\s*\/\s*\d|%|→|->/i.test(line)) return;
      var red = line.match(/(?:lv\.?|level|enhancement)\s*[:.]?\s*\+\s*(\d{1,3})(?!\d)/i);
      if (red && Number(red[1]) <= 100) { out.level = 100 + Number(red[1]); out.quality = 'red'; return; }
      var level = line.match(/(?:enhancement\s*(?:level)?|lv\.?|level)\s*[:.]?\s*(\d{1,3})(?!\d)/i);
      if (level && Number(level[1]) <= 200) out.level = Number(level[1]);
    });
    if (out.level > 100) out.quality = 'red';
    return out;
  }
function color(r,g,b){
 var max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,s=max?d/max:0,h=0;
 if(d)h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;
 if(s>.48&&max>166&&h>25&&h<55)return 1;
 if(s>.42&&max>166&&(h<15||h>345))return 2;
 if(s>.28&&max>153&&h>235&&h<280)return 3;
 return 0;
}
function detect(image){
 var w=image.width,h=image.height,a=image.data,mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),stack=new Int32Array(w*h),components=[];
 for(var i=0;i<mask.length;i++)mask[i]=color(a[i*4],a[i*4+1],a[i*4+2]);
 for(var start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;
  var k=mask[start],n=1,area=0,minx=w,miny=h,maxx=0,maxy=0;stack[0]=start;seen[start]=1;
  while(n){
   var p=stack[--n],x=p%w,y=Math.floor(p/w);area++;minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);
   var neighbors=[x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1];
   for(var j=0;j<4;j++){var q=neighbors[j];if(q>=0&&!seen[q]&&mask[q]===k){seen[q]=1;stack[n++]=q;}}
  }
  var cw=maxx-minx+1,ch=maxy-miny+1;
  if(cw>w*.1&&cw<w*.26&&ch>cw*.65&&ch<cw*1.35&&area/(cw*ch)>.13&&(minx<w*.28||minx>w*.65))components.push({x:minx,y:miny,w:cw,h:ch,bottom:maxy+1,k:k});
 }
 if(components.length<4)return null;
 function mode(list){return list.reduce(function(best,v){var score=list.filter(function(q){return Math.abs(q-v)<3;}).length;return score>best.score?{v:v,score:score}:best;},{v:0,score:0});}
 var size=mode(components.map(function(c){return c.w;})).v,left=mode(components.filter(function(c){return c.x<w*.28;}).map(function(c){return c.x;})).v;
 var bottoms=components.map(function(c){return c.bottom;}),rows=[];
 while(bottoms.length){var row=mode(bottoms);if(row.score>=2)rows.push(row.v-size);bottoms=bottoms.filter(function(b){return Math.abs(b-row.v)>=3;});}
 rows.sort(function(a,b){return a-b;});
 function tile(x,y){
  var counts=[0,0,0,0],points=[[.04,.4],[.04,.6],[.04,.8],[.95,.3],[.95,.5],[.95,.7],[.25,.95],[.5,.95],[.75,.95],[.4,.04],[.6,.04],[.8,.04]];
  points.forEach(function(pt){var px=Math.round(x+pt[0]*size),py=Math.round(y+pt[1]*size);if(px>=0&&px<w&&py>=0&&py<h)counts[mask[py*w+px]]++;});
  var kind=1;for(var k=2;k<4;k++)if(counts[k]>counts[kind])kind=k;
  return counts[kind]>=4?{x:x,y:y,w:size,h:size,quality:['','mythic','red','epic'][kind],support:counts[kind]}:null;
 }
 for(var r=0;r<rows.length;r++)for(var s=r+1;s<rows.length;s++){
  var gap=rows[s]-rows[r];if(gap<size*1.35||gap>size*2.8)continue;
  var tiles=[tile(left,rows[r]),tile(w-left-size,rows[r]),tile(left,rows[s]),tile(w-left-size,rows[s])];
  if(tiles.every(Boolean))return tiles.map(function(t,i){t.slot=['helm','gloves','chest','boots'][i];return t;});
 }
 return null;
}

function signature(image,tile,dx,dy){
 var out='',w=image.width,h=image.height,a=image.data;
 for(var y=0;y<16;y++)for(var x=0;x<16;x++){
  var px=Math.round(tile.x+tile.w*(-.095+(x+.5)/16*.34)+(dx||0)),py=Math.round(tile.y+tile.w*(-.095+(y+.5)/16*.37)+(dy||0));
  if(px<0||px>=w||py<0||py>=h){out+='0';continue;}
  var i=(py*w+px)*4,min=Math.min(a[i],a[i+1],a[i+2]),max=Math.max(a[i],a[i+1],a[i+2]);
  out+=String(Math.round(Math.max(0,Math.min(1,(min-100)/130))*9));
 }
 return out;
}


  var BADGES = [{"troop":"inf","pixels":"1100000000012222035444444455202234322111123351023200368741002204009300000186000000900576205600000090599990560000009059999056000000840899209200000049008306800000000780004910000000000598100000000000000000000000000000000000000010000000000000002210000000000000"},{"troop":"arc","pixels":"1100000000012222025233444455202224138302332351023204930102212204000069904783000000199990005000000049149001300000004700850310000000861009750000000000253995000000000000099400000000000000394000000000000000000000000000000000000010000000000000001110000000000000"},{"troop":"cav","pixels":"1100000000012222025544444455102234320123332240022220342022222104000499999200000000099999980000000069999999200000009984699980000000000079999700000000069999930000000009999930000000000000000000000000000000000000000000000000000010000000000000002210000000000000"}];
  function troop(image, tiles) {
    var votes = { inf: 0, cav: 0, arc: 0 };
    tiles.forEach(function (tile) {
      var scores = BADGES.map(function (template) {
        var best = Infinity;
        for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
          var pixels = signature(image, tile, dx, dy), score = 0;
          for (var i = 0; i < pixels.length; i++) score += Math.pow(Number(pixels[i]) - Number(template.pixels[i]), 2);
          best = Math.min(best, score / pixels.length / 81);
        }
        return { troop: template.troop, score: best };
      }).sort(function (a, b) { return a.score - b.score; });
      if (scores[0].score < .065 && scores[1].score - scores[0].score > .025) votes[scores[0].troop]++;
    });
    var types = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    return votes[types[0]] >= 3 ? types[0] : null;
  }
  function overviewLabels(items, quality, split, present) {
    var bands = [[], []];
    (items || []).forEach(function (item) {
      var points = item.poly || item.box || item.points || [];
      if (!points.length) return;
      var y = points.reduce(function (sum, p) { return sum + p[1]; }, 0) / points.length;
      bands[y < split ? 0 : 1].push(String(item.text || '').trim());
    });
    function number(band, mastery) {
      if (!band.length) return present && present[mastery ? 1 : 0] ? null : 0;
      var text = band.join(' ').replace(/[Il|](?=\d)/g, '1').replace(/[Oo](?=\d|$)/g, '0').replace(/[Ww](?=\d)/g, 'v').replace(/(\d)G\b/g, function (_, n) { return n + '0'; });
      var matches = text.match(mastery ? /(?:mastery|forge\s*(?:level|mastery)|l[vw]?\.?|level)\s*[:.]?\s*(\d{1,2})(?![\dA-Za-z])/i : /(?:\+|lv\.?|level|enhancement\s*(?:level)?)\s*[:.]?\s*(\d{1,3})(?![\dA-Za-z])/i);
      if (!matches && !mastery) matches = text.match(/(?:^|[^\d])(\d{1,3})\s*$/);
      if (!matches && /^\s*\d{1,3}\s*$/.test(text)) matches = [text, text.trim()];
      if (!matches && /^[\s+.:_-]*\d{1,3}[\s+.:_-]*$/.test(text)) matches = text.match(/\d{1,3}/);
      if (!matches) return null;
      var value = Number(matches[1]), limit = mastery ? 20 : quality === 'epic' ? 80 : 100;
      return value <= limit ? value : null;
    }
    var level = number(bands[0], false);
    return { level: level === null ? null : level + (quality === 'red' ? 100 : 0), mastery: number(bands[1], true) };
  }
  function canvas(width, height) {
    var out = document.createElement('canvas'); out.width = width; out.height = height; return out;
  }
  function blob(canvas) {
    return new Promise(function (resolve, reject) { canvas.toBlob(function (out) { if (out) resolve(out); else reject(new Error('Image unavailable')); }, 'image/png'); });
  }
  function labelBand(bitmap, x, y, size, mastery) {
    var width = Math.round(size * .76), height = Math.round(size * (mastery ? .24 : .35));
    var band = canvas(width, height), ctx = band.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, x + size * .28, y + size * (mastery ? .74 : -.04), size * .76, size * (mastery ? .24 : .35), 0, 0, width, height);
    var raw = canvas(width, height); raw.getContext('2d').drawImage(band, 0, 0);
    var image = ctx.getImageData(0, 0, width, height), data = image.data, mask = new Uint8Array(width * height), seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length), components = [];
    for (var i = 0; i < mask.length; i++) {
      var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      mask[i] = mastery ? r > 160 && g > 170 && b < 160 && g >= r * .85 : Math.min(r, g, b) > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 60;
    }
    for (var start = 0; start < mask.length; start++) {
      if (!mask[start] || seen[start]) continue;
      var n = 1, pixels = [], minx = width, miny = height, maxx = 0, maxy = 0;
      queue[0] = start; seen[start] = 1;
      while (n) {
        var pixel = queue[--n], px = pixel % width, py = Math.floor(pixel / width);
        pixels.push(pixel); minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py);
        var neighbours = [px ? pixel - 1 : -1, px < width - 1 ? pixel + 1 : -1, py ? pixel - width : -1, py < height - 1 ? pixel + width : -1];
        for (var j = 0; j < neighbours.length; j++) {
          var next = neighbours[j]; if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; queue[n++] = next; }
        }
      }
      var h = maxy - miny + 1, w = maxx - minx + 1;
      if (pixels.length > 5 && h > size * .035 && h < size * .2 && w < size * .23 && minx > 0 && miny > 0 && maxx < width - 1 && maxy < height - 1) components.push({ pixels: pixels, left: minx, top: miny, bottom: maxy, right: maxx, h: h, y: (miny + maxy) / 2 });
    }
    var anchors = components.filter(function (c) { return c.h > size * .1 && c.right > size * .52; }).sort(function (a, b) { return b.right - a.right; });
    var clean = new Uint8Array(mask.length);
    if (anchors.length) components.forEach(function (c) { if (Math.abs(c.y - anchors[0].y) < size * .09) c.pixels.forEach(function (p) { clean[p] = 1; }); });
    for (var p = 0; p < clean.length; p++) { data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = clean[p] ? 255 : 0; data[p * 4 + 3] = 255; }
    ctx.putImageData(image, 0, 0);
    var digits = raw;
    if (!mastery && anchors.length) {
      var glyphs = components.filter(function (c) { return c.h > size * .1 && c.right > anchors[0].right - size * .42 && Math.abs(c.y - anchors[0].y) < size * .045; });
      var left = Math.min.apply(null, glyphs.map(function (c) { return c.left; })) - 4;
      var top = Math.min.apply(null, glyphs.map(function (c) { return c.top; })) - 4;
      var right = Math.max.apply(null, glyphs.map(function (c) { return c.right; })) + 5;
      var bottom = Math.max.apply(null, glyphs.map(function (c) { return c.bottom; })) + 5;
      digits = canvas(right - left, bottom - top);
      digits.getContext('2d').drawImage(raw, left, top, right - left, bottom - top, 0, 0, digits.width, digits.height);
    }
    return { canvas: band, raw: raw, digits: digits, present: anchors.length > 0 };
  }
  async function overview(file, recognise) {
    var bitmap = await createImageBitmap(file);
    try {
      if (bitmap.height < bitmap.width * 1.2 || bitmap.height > bitmap.width * 3.5) return null;
      var scaled = canvas(360, Math.round(bitmap.height * 360 / bitmap.width)), ctx = scaled.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, scaled.width, scaled.height);
      var pixels = ctx.getImageData(0, 0, scaled.width, scaled.height), tiles = detect(pixels);
      if (!tiles) return null;
      var type = troop(pixels, tiles), scale = bitmap.width / scaled.width, result = [];
      for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i], x = tile.x * scale, y = tile.y * scale, size = tile.w * scale;
        var preview = canvas(180, 180), labels = canvas(320, 220), labelCtx = labels.getContext('2d');
        preview.getContext('2d').drawImage(bitmap, x - size * .1, y - size * .1, size * 1.15, size * 1.15, 0, 0, 180, 180);
        var enhancement = labelBand(bitmap, x, y, size, false), mastery = labelBand(bitmap, x, y, size, true);
        labelCtx.fillStyle = '#000'; labelCtx.fillRect(0, 0, 320, 220);
        labelCtx.drawImage(enhancement.canvas, 15, 8, 290, 92);
        labelCtx.drawImage(mastery.canvas, 15, 124, 290, 84);
        var values, failed = false;
        try {
          values = enhancement.present || mastery.present ? overviewLabels((await recognise(await blob(labels))).items, tile.quality, 110, [enhancement.present, mastery.present]) : { level: tile.quality === 'red' ? 100 : 0, mastery: 0 };
          if ((enhancement.present && values.level === null) || (mastery.present && values.mastery === null)) {
            labelCtx.fillStyle = '#000'; labelCtx.fillRect(0, 0, 320, 220);
            if (enhancement.present) labelCtx.drawImage(enhancement.digits, 15, 8, Math.min(290, 92 * enhancement.digits.width / enhancement.digits.height), 92);
            if (mastery.present) labelCtx.drawImage(mastery.raw, 15, 124, 290, 84);
            var retry = overviewLabels((await recognise(await blob(labels))).items, tile.quality, 110, [enhancement.present, mastery.present]);
            if (values.level === null) values.level = retry.level;
            if (values.mastery === null) values.mastery = retry.mastery;
          }
          if (!enhancement.present) values.level = tile.quality === 'red' ? 100 : 0;
          if (!mastery.present) values.mastery = 0;
        }
        catch (error) { values = values || { level: null, mastery: null }; failed = true; }
        result.push(Object.assign({ troop: type, slot: tile.slot, quality: tile.quality, overview: true, failed: failed, preview: await blob(preview) }, values));
      }
      return result;
    } finally { bitmap.close(); }
  }
  var api = { parse: parse, detect: detect, troop: troop, overviewLabels: overviewLabels, overview: overview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeroGearOCR = api;
})(typeof window !== 'undefined' ? window : globalThis);
