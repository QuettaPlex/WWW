//import cloudflare from "cloudflare";
import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

const isDebug = process.env.NODE_ENV === "development";

const app = express();
const port = process.env.PORT || 3000;

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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});