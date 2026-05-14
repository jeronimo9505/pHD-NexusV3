import { createClient } from "npm:@supabase/supabase-js@2";
import * as fs from "fs";

const SA_JSON = fs.readFileSync("Nueva carpeta/phdnexusdrive-e2d8905b1028.json", "utf8");

async function testUpload() {
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `. ;
  
  console.log("Requesting Token...");
  // using node crypto
  const crypto = require('crypto');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key, 'base64').replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `. ;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  console.log("Token response:", tokenData);
}

testUpload().catch(console.error);
