# Record of Processing Activities (NDPA)

Keep this current. Have counsel review before launch (see `../14-security-and-compliance.md §3`).

| Activity | Data | Purpose | Lawful basis | Processor | Location | Retention |
|----------|------|---------|--------------|-----------|----------|-----------|
| Accounts | name, email, password hash | Provide the service | Contract | Neon | Germany (Frankfurt) | Until deletion + grace |
| Payments | order, amounts, Paystack reference | Sell courses | Contract, legal obligation | Paystack, Neon | Nigeria, Germany | Statutory period |
| Instructor KYC | verification result, provider reference, matched name | Fraud prevention, payouts | Legal obligation, legitimate interest | Dojah, Neon | Nigeria, Germany | Account life + statutory period |
| Learning activity | progress, quiz attempts, integrity signals | Deliver courses, certify | Contract | Neon | Germany | Account life |
| Video | watch events | Playback, progress | Contract | Bunny | EU | Account life |
| Live classes | name, audio/video, recordings | Live teaching | Contract / consent for recording | Daily, Bunny | US/EU | Per course policy |
| Email | email address, message content | Transactional and opt-in marketing | Contract / consent | Resend | US | 30 days logs |
| Errors and analytics | pseudonymous ids, device info | Reliability, product improvement | Legitimate interest / consent | Sentry, PostHog | US/EU | 90 days |
