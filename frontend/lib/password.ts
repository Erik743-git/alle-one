export function isStrongPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(
    password
  );
}

export function getPasswordValidationMessage(password: string) {
  if (password.length < 8) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }

  if (!/[a-z]/.test(password)) {
    return "A senha deve ter pelo menos 1 letra minúscula.";
  }

  if (!/[A-Z]/.test(password)) {
    return "A senha deve ter pelo menos 1 letra maiúscula.";
  }

  if (!/\d/.test(password)) {
    return "A senha deve ter pelo menos 1 número.";
  }

  if (!/[^A-Za-z\d]/.test(password)) {
    return "A senha deve ter pelo menos 1 caractere especial.";
  }

  return "";
}