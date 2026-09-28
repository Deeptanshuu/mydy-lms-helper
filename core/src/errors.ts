export class MydyError extends Error {
  constructor(
    message: string,
    readonly url?: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

/** The request never got a response (offline, DNS, refused, too many redirects). */
export class NetworkError extends MydyError {}
/** MyDy redirected a signed-in request to its login page or home page. */
export class SessionExpiredError extends MydyError {}
/** Sign-in was rejected or the sign-in form couldn't be found. */
export class LoginFailedError extends MydyError {}
/** MyDy answered, but not with a page the parser recognises (4xx/5xx, error box). */
export class UnexpectedPageError extends MydyError {}
