import { z } from "zod";

export const targetUrlSchema = z.string().trim().url().refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "仅支持不含账号密码的 HTTP/HTTPS 地址");
