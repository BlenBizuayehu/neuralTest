use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

/// SMTP username (your full Gmail address)
///
/// In production you should NOT hard-code this, but for local testing this is acceptable.
const SMTP_USERNAME: &str = "blenaqua57js@gmail.com";

/// Gmail App Password (16-character app password, **not** your normal Gmail password)
///
/// IMPORTANT: replace this placeholder with your real app password.
/// Consider moving this to an environment variable later.
const SMTP_PASSWORD: &str = "fatrhcriehuresgv";

/// Send a verification email with a 6-digit code.
///
/// This is used by `db::register_user` and `db::generate_reset_code`.
pub async fn send_verification_email(to_email: &str, code: &str) -> Result<(), String> {
    // Build HTML email
    let email = Message::builder()
        .from(
            SMTP_USERNAME
                .parse()
                .map_err(|e: lettre::address::AddressError| e.to_string())?,
        )
        .to(
            to_email
                .parse()
                .map_err(|e: lettre::address::AddressError| e.to_string())?,
        )
        .subject("Project Neural Verification Code")
        .header(ContentType::TEXT_HTML)
        .body(format!(
            "<h2>Project Neural Verification</h2>\
             <p>Your verification code is:</p>\
             <p><b style='font-size: 24px; letter-spacing: 4px;'>{code}</b></p>\
             <p>This code will expire soon. If you did not request this, you can ignore this email.</p>"
        ))
        .map_err(|e: lettre::error::Error| e.to_string())?;

    let creds = Credentials::new(SMTP_USERNAME.to_string(), SMTP_PASSWORD.to_string());

    // Use Gmail over STARTTLS (port 587) with rustls via AsyncSmtpTransport.
    // This matches the `tokio1` + `tokio1-rustls-tls` features you enabled in Cargo.toml.
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay("smtp.gmail.com")
            .map_err(|e| e.to_string())?
            .credentials(creds)
            .build();

    // Send the email asynchronously
    mailer.send(email).await.map_err(|e| e.to_string())?;

    Ok(())
}
