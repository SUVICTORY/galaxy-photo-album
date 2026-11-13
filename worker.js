// R2 照片扫描 Worker
// 自动扫描四个文件夹，生成 photos.json（支持固定星、最新星、随机星）
// 图片通过代理模式访问，不暴露 R2 链接

export default {
  async fetch(request, env) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
let pathname = url.pathname;

// 如果路径以 /api 开头，则去掉它，方便后续匹配
if (pathname.startsWith('/api')) {
    pathname = pathname.slice(4); // 去掉 '/api' 四个字符
}
// 现在，pathname 就变成了 /starwords.json 或 / 等形式
    // 代理图片请求（前端通过 /image?path=xxx 访问）
  if (pathname === '/image') {
  let imagePath = url.searchParams.get('path');
  if (!imagePath) {
    return new Response('Missing path parameter', { status: 400 });
  }
  
  // 解码 URL 编码的路径
  imagePath = decodeURIComponent(imagePath);
  
  // 验证用户是否已登录
  const userEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!userEmail) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  try {
    const object = await env.MY_BUCKET.get(imagePath);
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=3600');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(object.body, { headers });
  } catch (error) {
    console.error('图片代理错误:', error);
    return new Response('Internal Error', { status: 500 });
  }
}

    // 银河相册：返回 photos.json（带代理路径）
    if (pathname === '/' || pathname === '/photos.json') {
      const photosData = await scanPhotos(env.MY_BUCKET);
      return new Response(JSON.stringify(photosData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

   

        

        
      }
    }


    


// ==================== 银河相册照片处理（代理模式） ====================
async function scanPhotos(bucket) {
  const folders = ['岁岁与共', '三餐四季', '沿途同行', '温暖朝夕'];
  const folderColors = {
    '岁岁与共': '#ffaa88',
    '三餐四季': '#88aaff',
    '沿途同行': '#dd88ff',
    '温暖朝夕': '#ffaa66',
  };

  const galaxies = [];

  for (const folder of folders) {
    const objects = await bucket.list({ prefix: `${folder}/` });

    let photos = [];
    for (const obj of objects.objects) {
      const key = obj.key.toLowerCase();
      if (!key.endsWith('.jpg') && !key.endsWith('.jpeg') && !key.endsWith('.png') && !key.endsWith('.gif') && !key.endsWith('.webp')) {
        continue;
      }

      const fileName = obj.key.split('/').pop();
      const title = fileName.replace(/\.[^/.]+$/, '');
      const uploadDate = obj.uploaded;

      // 返回代理路径，不暴露 R2 链接
      const proxyUrl = `/image?path=${encodeURIComponent(obj.key)}`;

      photos.push({
        url: proxyUrl,
        title: title,
        uploadDate: uploadDate,
        starColor: folderColors[folder],
        fileName: fileName,
      });
    }

    // 按上传时间倒序（最新的在前）
    photos.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    // 应用星星显示逻辑
    const processedPhotos = selectPhotosForDisplay(photos);
    // 按上传时间正序（旧在内圈，新在外圈，用于螺旋分布）
    processedPhotos.sort((a, b) => new Date(a.uploadDate) - new Date(b.uploadDate));
    processedPhotos.forEach((photo, idx) => {
      const t = idx / (processedPhotos.length - 1 || 1);
      photo.size = 0.18 + t * (0.42 - 0.18);
    });

    galaxies.push({
      name: folder,
      nameEn: getEnName(folder),
      innerColor: folderColors[folder],
      outerColor: folderColors[folder],
      starColorTheme: folderColors[folder],
      photos: processedPhotos,
    });
  }
  return galaxies;
}

// 星星显示逻辑：总数 ≤ 40 全显，否则固定星 + 最新20 + 随机补充
function selectPhotosForDisplay(photos) {
  const MAX_DISPLAY = 40;
  if (photos.length <= MAX_DISPLAY) return photos;

  // 分离固定星（文件名以 'top' 开头）
  const fixed = [];
  const normal = [];
  for (const p of photos) {
    if (p.fileName && p.fileName.toLowerCase().startsWith('top')) {
      fixed.push(p);
    } else {
      normal.push(p);
    }
  }

  let result = [...fixed];
  if (result.length >= MAX_DISPLAY) {
    return result.slice(0, MAX_DISPLAY);
  }

  // 从 normal 中取最新的 20 张
  const latest = normal.slice(0, 20);
  result = [...result, ...latest];
  if (result.length >= MAX_DISPLAY) {
    return result.slice(0, MAX_DISPLAY);
  }

  // 剩余名额随机从 normal 中排除 latest 后的部分抽取
  const remaining = normal.slice(20);
  const needed = MAX_DISPLAY - result.length;
  // 随机取样（Fisher-Yates）
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  const randomPicks = remaining.slice(0, needed);
  result = [...result, ...randomPicks];
  return result;
}



// 获取英文名称
function getEnName(folder) {
  const names = {
    '岁岁与共': 'Years Together',
    '三餐四季': 'Daily Life',
    '沿途同行': 'Journey',
    '温暖朝夕': 'Warm Moments',
  };
  return names[folder] || folder;
}