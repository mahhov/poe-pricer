const http = require('http');
const GoogleAuth = require('google-oauth2-x');
const {shell} = require('electron');
const axios = require('axios');

class GmailAuth extends GoogleAuth {
	openConsentScreen_() {
		return new Promise(resolve => {
			let server = http.createServer((req, res) => {
				resolve(req.url);
				res.end('thanks');
				server.close();
			}).listen();
			let port = server.address().port;
			let endpoint = this.getConsentScreenEndpoint_(`http://localhost:${port}`);
			shell.openExternal(endpoint);
		});
	}

	async queryEmailIds(q, maxResults = 1) {
		return (await this.getMessage_(`?${GmailAuth.queryParams_({q, maxResults})}`)).messages.map(({id}) => id);
	}

	async getEmailBody(emailId) {
		let encoded = (await this.getMessage_(`/${emailId}`)).payload.body.data;
		return Buffer.from(encoded, 'base64').toString();
	}

	static queryParams_(params = {}) {
		return Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&');
	}

	async getMessage_(pathEnd) {
		return (await axios.get(
			`https://www.googleapis.com/gmail/v1/users/me/messages${pathEnd}`,
			{headers: await this.getHeaders_()}))
			.data;
	}

	async getHeaders_() {
		return this.headers_ = this.headers_ || {
			Authorization: `Bearer ${await this.getToken()}`,
			'Content-Type': 'application/json',
		};
	}
}

let gmailAuth = new GmailAuth(
	'./resources/config/gmailCredentials.json',
	'./resources/config/gmailToken.json',
	'https://www.googleapis.com/auth/gmail.readonly');

let fetch = async () => {
	let emailId = (await gmailAuth.queryEmailIds('path of exile'))[0];
	let emailBody = await gmailAuth.getEmailBody(emailId);
	return emailBody.match(/after logging in:\n\n(.*)/)[1];
};

module.exports = {fetch};
