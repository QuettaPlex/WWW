//import cloudflare from "cloudflare";
import fs from "node:fs";
import express from "express";
import morgan from "morgan";
import * as dateFns from "date-fns";
import dotenv from "dotenv";
import generateErrorPage from "./modules/generate_error_page";
import extractYAMLAndHTML from "./modules/extract_yaml_and_html";
dotenv.config();

const isDebug = process.env.NODE_ENV === "development";

const app = express();
const port = process.env.PORT || 3000;

const template = fs.readFileSync("./public/page.html", "utf8");

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(isDebug ? morgan("dev") : morgan("combined"));
app.use((req, res, next) => {
    if (req.headers["cf-connecting-ip"]) {
        req.headers["x-forwarded-for"] = req.headers["cf-connecting-ip"];
    }

    if (!req.headers.host?.includes("quettaplex.com") && !isDebug) {
        return res.redirect(302, "https://quettaplex.com");
    }

    next();
});
app.use(express.static("public"));
app.get("/sitemap.xml", (req, res) => {
    const getFiles = (dir: string): string[] => {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        const files = dirents.map((dirent) => {
            const res = dir + "/" + dirent.name;
            return dirent.isDirectory() ? getFiles(res) : res;
        });
        return Array.prototype.concat(...files);
    };
    const files = getFiles("./views");
    const urls = files.filter((file) => file.endsWith(".html")).map((file) => {
        const url = file.replace("./views", "").replace("index.html", "");
        const lastmod = dateFns.format(fs.statSync(file).mtime, "yyyy-MM-dd");
        const priority = Math.max(1 - (url.split("/").length - 2) * 0.1, 0.5);
        return `<url><loc>https://renorari.net${encodeURI(url)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    res.header("Content-Type", "text/xml");
    res.send(xml);
});
app.get("*", (req, res) => {
    const requestPath = decodeURI(req.url.endsWith("/") ? req.url + "index.html" : req.url).replace(/\.\./g, "");
    const contentPath = requestPath.replace("/", "./views/");
    fs.readFile(contentPath, "utf8", (err, data) => {
        if (err) {
            switch (err.code) {
            case "ENOENT":
                res.send(generateErrorPage(404));
                break;
            default:
                res.send(generateErrorPage(500));
                break;
            }
        } else {
            const extracted = extractYAMLAndHTML(data);
            const info = extracted.yaml as { title: string, description: string, keywords: string, image: string, url: string };
            const contentHTML = extracted.html;
            res.send(
                template
                    .replace(/{{title}}/g, info.title)
                    .replace(/{{content}}/g, contentHTML)
                    .replace(/{{description}}/g, info.description)
                    .replace(/{{keywords}}/g, info.keywords)
                    .replace(/{{image}}/g, info.image)
                    .replace(/{{url}}/g, `https://quettaplex.com${requestPath}`)
            );
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});