import {
  ACCOUNT_IMAGE_MAX_LENGTH,
  validAccountImage,
} from '../../../shared/account-image';

export async function prepareAccountImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  }
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('图片大小需在 5 MB 以内，请选择一张较小的图片。');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error('无法读取这张图片，请换一张图片重试。');
    }
    if (!img.naturalWidth || !img.naturalHeight)
      throw new Error('图片尺寸无效。');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器无法处理图片，请更换浏览器重试。');
    // Fit the whole image so platform logos and identifying details are not cropped.
    const scale = Math.min(128 / img.naturalWidth, 128 / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (128 - width) / 2, (128 - height) / 2, width, height);
    for (const quality of [0.85, 0.65, 0.45]) {
      const data = canvas.toDataURL('image/webp', quality);
      if (data.length <= ACCOUNT_IMAGE_MAX_LENGTH && validAccountImage(data))
        return data;
    }
    // Fallback for browsers without a compact WebP encoder.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    const data = canvas.toDataURL('image/jpeg', 0.5);
    if (validAccountImage(data)) return data;
    throw new Error('这张图片细节过多，请换一张更简洁的图片。');
  } finally {
    URL.revokeObjectURL(url);
  }
}
