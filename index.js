import puppeteer from 'puppeteer-extra';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import fs from 'fs';
import nodemailer from "nodemailer"; // npm install nodemailer
import dotenv from 'dotenv';  // npm install dotenv
dotenv.config();
puppeteer.use(AdblockerPlugin());
import searchParams from './searchParams.js';

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;

// https://www.youtube.com/watch?v=ud3j4bCUD50&t=305s&ab_channel=bufahad
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    type: "login", // add this line
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  authMethod: "PLAIN", // add this line PLAIN or LOGIN?
});

async function sendEmail(to, subject, text) {
  try {
    const mailOptions = {
      from: "Gediminas Vilbeta <info.vilbeta@gmail.com>",
      to,
      subject,
      text,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`sending email from ${EMAIL_USER} to ${EMAIL_TO}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}


(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.okidoki.ee/buy/1601/?sort=2');

  const vehicles = await page.$$eval('.classifieds__item', (items) =>
    items.map((item) => {
      const dataIid = item.querySelector('.fav-button').dataset.iid;
      const titleElement = item.querySelector('.horiz-offer-card__title-link');
      const titleText = titleElement.textContent.trim();
      const normalizedTitle = titleText?.toLowerCase()?.replace(/[^a-z0-9]/g, '') ?? 'n/a';
      const link = item.querySelector('.horiz-offer-card__image-link').href;
      const yearMatch = titleText.match(/\b\d{4}\b/);
      const year = yearMatch ? yearMatch[0] : 'n/a';
      return { dataIid, titleText, normalizedTitle, link, year };
    })
  );

  let allVehicles = [];

  try {
    const fileData = fs.readFileSync('searchResults.json', 'utf8');
    allVehicles = JSON.parse(fileData);
  } catch (error) {
    console.log('Error reading searchResults.json:', error.message);
  }

  let foundVehiclesCount = 0;

  for (const vehicle of vehicles) {
    const matchedSearchParams = searchParams.find(searchParam => {
      const { make, model, years } = searchParam;
      const makeMatch = vehicle.normalizedTitle.includes(make.toLowerCase());
      const modelMatch = vehicle.normalizedTitle.includes(model.toLowerCase());
      const yearMatch = years.some(year => vehicle.normalizedTitle.includes(year));
      return makeMatch && modelMatch && yearMatch;
    });

    if (matchedSearchParams) {
      const existingVehicle = allVehicles.find(v => v.dataIid === vehicle.dataIid);

      if (existingVehicle) {
        console.log(`Already printed vehicle Data-IID: ${vehicle.dataIid} ${existingVehicle.link}`);
      } else {
        console.log(`MATCHED vehicle Data-IID: ${vehicle.dataIid} ${vehicle.link}`);
        allVehicles.push(vehicle);
        foundVehiclesCount++;

        // Send Email
        const emailText = `ID: ${vehicle.dataIid}
        Make: ${matchedSearchParams.make}
        Model: ${matchedSearchParams.model}
        Year: ${vehicle.year}
        Link: ${vehicle.link}`;

        await sendEmail(EMAIL_TO, vehicle.dataIid, emailText);
      }
    }
  }

  console.log(`Found ${foundVehiclesCount} new vehicles matching search parameters...`);

  fs.writeFileSync('searchResults.json', JSON.stringify(allVehicles, null, 2));

  console.log(`Results written to searchResults.json`);

  await browser.close();
})();
