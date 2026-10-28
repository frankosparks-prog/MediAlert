const env = require('../config/env');

class SMSService {
  constructor() {
    this.endpoint = 'https://sms.textsms.co.ke/api/services/sendsms/';
    this.apiKey = env.TEXTSMS_API_KEY;
    this.partnerId = env.PARTNER_ID;
    this.shortcode = env.SENDER_ID;
  }

  /**
   * Normalize phone number to standard international format (e.g. 254XXXXXXXXX)
   * Handles local Kenyan formats (07XX, 01XX), numbers with +, spaces, or dashes.
   * @param {string} phone
   * @returns {string|null}
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.startsWith('0') && (clean.length === 10)) {
      clean = '254' + clean.slice(1);
    } else if (clean.length === 9) {
      clean = '254' + clean;
    }
    return clean.length >= 10 ? clean : null;
  }

  /**
   * Send SMS via TextSMS Gateway
   * @param {string} phone - Recipient phone number
   * @param {string} message - Message body
   * @returns {Promise<{success: boolean, messageId?: string, raw?: any, error?: string}>}
   */
  async sendSMS(phone, message) {
    const mobile = this.normalizePhoneNumber(phone);
    if (!mobile) {
      console.warn(`⚠️ [SMS Service] Invalid phone number provided: "${phone}". Skipping SMS.`);
      return { success: false, error: 'invalid_phone_number' };
    }

    const payload = {
      apikey: this.apiKey,
      partnerID: this.partnerId,
      shortcode: this.shortcode,
      mobile,
      message
    };

    console.log(`\n📨 [SMS Service] Dispatching SMS via TextSMS Gateway...`);
    console.log(`   Destination: ${mobile}`);
    console.log(`   Sender ID: ${this.shortcode}`);
    console.log(`   Message: "${message}"`);

    // If API credentials are not set (e.g. placeholder), log and simulate in test/dev
    if (!this.apiKey || !this.partnerId) {
      console.warn(`⚠️ [SMS Service] TextSMS credentials not fully configured. Simulating delivery.`);
      return {
        success: true,
        simulated: true,
        messageId: `sim_${Date.now()}`
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { text: responseText };
      }

      console.log(`   TextSMS Gateway Response (${response.status}):`, JSON.stringify(result));

      // Standard TextSMS response format: { responses: [{ "respose-code": 200, "messageid": ... }] }
      const firstResponse = result?.responses?.[0];
      const isSuccess = response.ok && (firstResponse?.['respose-code'] === 200 || firstResponse?.['response-code'] === 200 || result?.status === 'success');
      const messageId = firstResponse?.messageid ? String(firstResponse.messageid) : `sms_${Date.now()}`;

      if (isSuccess || response.status === 200) {
        return {
          success: true,
          messageId,
          raw: result
        };
      } else {
        return {
          success: false,
          error: firstResponse?.['response-description'] || `Gateway error with HTTP ${response.status}`,
          raw: result
        };
      }
    } catch (error) {
      console.error(`🔴 [SMS Service] Failed to send SMS via TextSMS: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SMSService();

