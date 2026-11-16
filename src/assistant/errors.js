export class AssistantError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
