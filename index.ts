import fs from "node:fs";
import express from "express";
import * as dateFns from "date-fns";
import * as mailer from "nodemailer";
import * as log4js from "log4js";
import dotenv from "dotenv";
import generateErrorPage from "./modules/generate_error_page";
import extractYAMLAndHTML from "./modules/extract_yaml_and_html";
import getIP from "./modules/get_ip";
dotenv.config();

log4js.configure({
    appenders: {
        stdout: {
            type: "stdout"
        },
        system: {
            type: "dateFile",
            filename: "logs/server.log",
            pattern: ".yyyy-MM-dd",
            keepFileExt: true,
            compress: true,
            daysToKeep: 30
        }
    },
    categories: {
        default: {
            appenders: ["stdout", "system"],
            level: "trace"
        }
    }
});

const isDebug = process.env.NODE_ENV === "development";

const app = express();
const port = process.env.PORT || 3000;
const accessLogger = log4js.getLogger("access");
const smtp = mailer.createTransport({
    "host": process.env.MAIL_HOST,
    "port": Number(process.env.MAIL_PORT),
    "secure": true,
    "auth": {
        "user": process.env.MAIL_USER,
        "pass": process.env.MAIL_PASS
    }
});

const discordWebhook = process.env.DISCORD_WEBHOOK as string;
const template = fs.readFileSync("./public/page.html", "utf8");

const ipAccessCount: { [key: string]: number } = {};
let underAttackTimer: NodeJS.Timeout | null = null;

function setUnderAttackTimer() {
    if (underAttackTimer) clearTimeout(underAttackTimer);
    underAttackTimer = setTimeout(() => {
        fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/settings/security_level`, {
            "method": "PATCH",
            "headers": {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.CLOUDFLARE_TOKEN}`
            },
            "body": JSON.stringify({
                "value": "high"
            })
        }).then(() => {
            underAttackTimer = null;
        }).catch();
    }, 60000);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(async (req, res, next) => {
    if (req.headers["cf-connecting-ip"]) {
        req.headers["x-forwarded-for"] = getIP(req);
    }

    if (!req.headers.host?.includes("quettaplex.com") && !isDebug) {
        return res.redirect(302, "https://quettaplex.com");
    }

    accessLogger.info(`${getIP(req)} - "${req.method} ${req.url} HTTP/${req.httpVersion}" ${res.statusCode} ${req.headers["content-length"] || 0} "${req.headers.referer || "-"}" "${req.headers["user-agent"] || "-"}"`);

    if (req.method !== "GET") {
        ipAccessCount[getIP(req)] = (ipAccessCount[getIP(req)] || 0) + 1;
        if (ipAccessCount[getIP(req)] > 2) {
            if (underAttackTimer) {
                setUnderAttackTimer();
            } else {
                fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/settings/security_level`, {
                    "method": "PATCH",
                    "headers": {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.CLOUDFLARE_TOKEN}`
                    },
                    "body": JSON.stringify({
                        "value": "under_attack"
                    })
                }).catch();
                setUnderAttackTimer();
                return res.status(429).send(generateErrorPage(429));
            }
            setTimeout(() => {
                ipAccessCount[getIP(req)] = (ipAccessCount[getIP(req)] || 0) - 1;
            }, 60000);
        }
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
        const isNoindex = fs.readFileSync(file, "utf8").includes("<meta name=\"robots\" content=\"noindex\">");
        if (isNoindex) return "";
        return `<url><loc>https://quettaplex.com${encodeURI(url)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;
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
            case "EISDIR":
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
                    .replace(/{{url}}/g, `https://quettaplex.com${requestPath}`.replace("index.html", ""))
            );
        }
    });
});
app.post("/contact.html", (req, res) => {
    const {
        name,
        email,
        tel,
        zip,
        address,
        subject,
        message,
    } = req.body;

    if (!name || !email || !tel || !zip || !address || !subject || !message) {
        return res.status(400).send(generateErrorPage(400));
    }
    if (!email.match(/.+@.+/)) {
        return res.status(400).send(generateErrorPage(400));
    }
    // eslint-disable-next-line no-useless-escape
    if (!tel.match(/^[0-9]{2,4}[0-9]{2,4}[0-9]{3,4}$/)) {
        return res.status(400).send(generateErrorPage(400));
    }
    if (!zip.match(/^[0-9]{3}-[0-9]{4}$/)) {
        return res.status(400).send(generateErrorPage(400));
    }
    if (name.length > 50 || email.length > 50 || tel.length > 50 || zip.length != 8 || address.length > 50 || subject.length > 50 || message.length > 1000) {
        return res.status(400).send(generateErrorPage(400));
    }

    fetch(discordWebhook, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content: `**${name}**(${getIP(req)})からのお問い合わせです。`,
            embeds: [
                {
                    title: subject,
                    description: message,
                    fields: [
                        {
                            name: "名前",
                            value: name,
                        },
                        {
                            name: "メールアドレス",
                            value: email,
                        },
                        {
                            name: "電話番号",
                            value: tel,
                        },
                        {
                            name: "郵便番号",
                            value: zip,
                        },
                        {
                            name: "住所",
                            value: address,
                        },
                    ],
                }
            ]
        })
    }).then(() => {
        smtp.sendMail({
            from: "\"QuettaPlex\" <contact@quettaplex.com>",
            to: email,
            subject: "【QuettaPlex】お問い合わせ確認メール",
            text: `この度はQuettaPlexにお問い合わせいただきありがとうございます。\n以下の内容でお問い合わせを受け付けました。\n\nお名前: ${name}\nメールアドレス: ${email}\n電話番号: ${tel}\n郵便番号: ${zip}\n住所: ${address}\n件名: ${subject}\n本文: ${message}\n\n後ほど担当者よりご連絡いたしますので、今しばらくお待ちください。\n※なお、このメールは自動送信によるもので、返信などはできません。`,
        })
            .then(() => {
                res.redirect(302, "/contact-success.html");
            })
            .catch(() => {
                res.status(500).send(generateErrorPage(500));
            });
    }).catch(() => {
        res.status(500).send(generateErrorPage(500));
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});