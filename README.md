# MotelPilot（预览版）

一个面向独立酒店和汽车旅馆业主的托管服务网站，用 Astro 构建的静态站点。

- 在线预览：https://kkoryz.github.io/motelpilot/
- 预览页面带 `noindex`，不会被搜索引擎收录。

## 现状

这是设计预览版，还不是正式上线版本：

- 品牌名 MotelPilot 是占位名；
- 联系方式（邮箱、电话、地址）是占位内容，上线前会换成真实信息；
- 部分数字（如 "since 2016"、"60 hotels and motels"）尚未经业主确认，上线前会核对或替换；
- 所有照片都是为本站生成的图片，没有使用其他网站的图片。

## 本地运行

```bash
pnpm install
pnpm dev
```

`gh-pages` 分支是构建好的静态页面，供 GitHub Pages 使用。
