export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error(`伺服器回傳空白內容 (${response.status})`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    if (response.status === 413 || preview.includes("413")) {
      throw new Error("照片太大，請重拍或改用手動輸入");
    }
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        `伺服器錯誤 (${response.status})，請稍後再試或改用手動輸入`,
      );
    }
    throw new Error(`伺服器回傳格式錯誤 (${response.status})`);
  }
}