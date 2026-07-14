import "dotenv/config";
import express, { Request, Response } from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma";

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

app.get("/", async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
    res.render("index", { users });
  } catch (e) {
    res.status(500).send("DB接続エラーじゃ。URLを確認してくれ。");
  }
});

app.post("/users", async (req: Request, res: Response) => {
  if (req.body.name) {
    await prisma.user.create({ data: { name: req.body.name } });
  }
  res.redirect("/");
});

app.listen(process.env.PORT || 8888, () => {
  console.log("Server running!");
});
