/**
 * @license
 * Copyright Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Modifications to this file fall under the MIT LICENSE. */

// ORIGINAL:
// https://developers.google.com/sheets/api/quickstart/nodejs

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { google } = require('googleapis');
const { logger } = require('./loggers');
require('dotenv').config({path: path.join(__dirname, '../.env')})

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(__dirname, '../token.json');
const TIMEOUT = 10000; // 10 seconds

// Load client secrets from a local file.
fs.readFile(path.join(__dirname, '../credentials.json'), (err, content) => {
	if (err) {
		logger.fatal('Error loading client secret file:', err);
		return;
	}
	// Authorize a client with credentials, then call the Google Sheets API.
	authorize(JSON.parse(content), startUploadCycle);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
	const {client_secret, client_id, redirect_uris} = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(
		client_id, client_secret, redirect_uris[0]);

	// Check if we have previously stored a token.
	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getNewToken(oAuth2Client, callback);
		oAuth2Client.setCredentials(JSON.parse(token));
		callback(oAuth2Client);
	});
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});
	console.log('Authorize this app by visiting this url:', authUrl);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	rl.question('Enter the code from that page here: ', (code) => {
		rl.close();
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error while trying to retrieve access token', err);
			oAuth2Client.setCredentials(token);
			// Store the token to disk for later program executions
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
				if (err) return console.error(err);
				console.log('Token stored to', TOKEN_PATH);
			});
			callback(oAuth2Client);
		});
	});
}

let queue = [];
let interval;
let submitFunction;

function startUploadCycle(auth) {
	const sheets = google.sheets({version: 'v4', auth});

	// delay a random number of seconds to offset upload cycles
	// while clustering.
	// REVIEW: should I make a shared queue between processes?
	setTimeout(() => {}, (Math.random() * 20) + 10);
	submitFunction = async () => {
		if (queue.length === 0) {
			logger.trace("nothing to append");
			return;
		}
		const range = "A:I";
		const request = {
			spreadsheetId: process.env.SHEET_ID,
			range: range,
			valueInputOption: 'RAW',
			insertDataOption: 'INSERT_ROWS',
			resource: {
				range: range,
				majorDimension: "ROWS",
				values: queue
			},
			auth: auth,
		};
		try {
			await sheets.spreadsheets.values.append(request)
			logger.info(`appended ${queue.length} row(s)`);
			queue = [];
		} catch (err) {
			logger.fatal("failed to upload to google sheets", err);
		}

	}
	// clear the queue every TIMEOUT seconds
	interval = setInterval(submitFunction, TIMEOUT);
}

// gracefully shutdown
process.on('SIGINT', () => {
	submitFunction(); // try to back up any last data
	clearInterval(interval);
	logger.trace("shutdown google sheets interval");
});

// TODO: add jsdoc
function addToQueue(student) {
	queue.push(student);
}

module.exports = {
	addToQueue
};