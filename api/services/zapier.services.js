const axios = require("axios");

const ZAPIER_WEBHOOK_URL =
  "https://hooks.zapier.com/hooks/catch/26160548/uqsg27t/";

const sendToZapier = async (payload) => {
  return axios.post(ZAPIER_WEBHOOK_URL, payload, {
    headers: {
      "Content-Type": "application/json",
    },
  });
};

module.exports = {
  sendToZapier,
};
