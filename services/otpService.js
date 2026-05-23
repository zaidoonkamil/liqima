const OtpCode = require("../models/OtpCode");
const { Op } = require("sequelize");

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000);
const OTP_RESEND_MS = Number(process.env.OTP_RESEND_MS || 60 * 1000);

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(phone = "") {
  const raw = String(phone).trim();

  if (raw.startsWith("964") && raw.length === 13) {
    return raw;
  }

  if (raw.startsWith("0") && raw.length === 11) {
    return `964${raw.slice(1)}`;
  }

  if (raw.length === 10) {
    return `964${raw}`;
  }

  return raw;
}

async function createOtp(phone, purpose = "activation") {
  const normalizedPhone = normalizePhone(phone);
  const now = new Date();

  const latestOtp = await OtpCode.findOne({
    where: {
      phone: normalizedPhone,
      purpose,
      isUsed: false,
      expiryDate: {
        [Op.gt]: now,
      },
    },
    order: [["createdAt", "DESC"]],
  });

  if (latestOtp) {
    const nextAllowedAt = latestOtp.createdAt.getTime() + OTP_RESEND_MS;
    if (nextAllowedAt > Date.now()) {
      const waitSeconds = Math.ceil((nextAllowedAt - Date.now()) / 1000);
      throw new Error(`Please wait ${waitSeconds} seconds before requesting a new OTP`);
    }
  }

  await OtpCode.update(
    { isUsed: true },
    {
      where: {
        phone: normalizedPhone,
        purpose,
        isUsed: false,
      },
    }
  );

  const code = generateOtpCode();
  const expiryDate = new Date(Date.now() + OTP_TTL_MS);

  await OtpCode.create({
    phone: normalizedPhone,
    code,
    purpose,
    expiryDate,
  });

  return {
    phone: normalizedPhone,
    code,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    retryAfterSeconds: Math.floor(OTP_RESEND_MS / 1000),
  };
}

async function verifyOtp(phone, code, purpose = "activation") {
  const normalizedPhone = normalizePhone(phone);

  const otp = await OtpCode.findOne({
    where: {
      phone: normalizedPhone,
      purpose,
      code: String(code).trim(),
      isUsed: false,
      expiryDate: {
        [Op.gt]: new Date(),
      },
    },
    order: [["createdAt", "DESC"]],
  });

  if (!otp) {
    throw new Error("OTP code is invalid or expired");
  }

  otp.isUsed = true;
  await otp.save();

  return {
    phone: normalizedPhone,
    purpose,
    verified: true,
  };
}

async function deleteOtpByCode(phone, code, purpose = "activation") {
  const normalizedPhone = normalizePhone(phone);

  await OtpCode.destroy({
    where: {
      phone: normalizedPhone,
      code: String(code).trim(),
      purpose,
      isUsed: false,
    },
  });
}

module.exports = {
  createOtp,
  deleteOtpByCode,
  normalizePhone,
  verifyOtp,
};
