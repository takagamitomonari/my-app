import http from "node:http";

// 本番環境（Renderなど）とローカルの両方で動くように設定するぞ
const PORT = process.env.PORT || 8888;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // 文字化け対策じゃ
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (url.pathname === "/") {
    res.writeHead(200);
    res.end("こんにちは！");
  } else if (url.pathname === "/ask") {
    const q = url.searchParams.get("q") ?? "なにもないぞ";
    res.writeHead(200);
    res.end(`お主の質問は '${q}' じゃな？`);
  } else {
    res.writeHead(404);
    res.end("ページが見つからんぞ");
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
