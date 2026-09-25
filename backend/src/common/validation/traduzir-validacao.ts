import type { ValidationError } from 'class-validator';

/**
 * Tradução dos erros de validação para português.
 *
 * O class-validator responde em inglês ("description must be longer than or
 * equal to 2 characters") sempre que a regra não tem `message` escrita à mão —
 * e no dia em que isto foi escrito eram 897 regras assim, contra 17 com
 * mensagem. Corrigir regra por regra não fecha o problema: o próximo campo
 * novo volta em inglês. Por isso a tradução é central, por tipo de regra.
 *
 * Mensagem que já veio escrita em português fica como está: só se traduz o
 * texto padrão do class-validator.
 */

/** Nome que a pessoa reconhece na tela. Campo fora da lista aparece entre aspas. */
const ROTULOS: Record<string, string> = {
  title: 'o título',
  description: 'a descrição',
  name: 'o nome',
  email: 'o e-mail',
  password: 'a senha',
  newPassword: 'a nova senha',
  companyId: 'a empresa',
  clientId: 'o cliente',
  clientName: 'o cliente',
  deskId: 'a mesa',
  deskName: 'a mesa',
  specialtyId: 'a especialidade',
  specialtyIds: 'as especialidades',
  priorityId: 'a prioridade',
  priorityName: 'a prioridade',
  classificationId: 'a classificação',
  responsibleId: 'o responsável',
  responsibleName: 'o responsável',
  requestorName: 'o nome do solicitante',
  requestorEmail: 'o e-mail do solicitante',
  requestorTelephone: 'o telefone do solicitante',
  ccEmails: 'os e-mails em cópia',
  stageName: 'o estágio',
  statusName: 'o status',
  externalGmudRef: 'a referência da GMUD',
  date: 'a data',
  startDate: 'a data de início',
  endDate: 'a data de fim',
  dueDate: 'a data de entrega',
  initTime: 'a hora de início',
  endTime: 'a hora de fim',
  startTime: 'a hora de início',
  fromTime: 'a hora de início',
  toTime: 'a hora de fim',
  note: 'a observação',
  notes: 'as observações',
  reason: 'o motivo',
  motivo: 'o motivo',
  cancelReason: 'o motivo do cancelamento',
  message: 'a mensagem',
  subject: 'o assunto',
  body: 'o texto',
  cnpj: 'o CNPJ',
  address: 'o endereço',
  code: 'o código',
  token: 'o código',
  color: 'a cor',
  status: 'a situação',
  role: 'o perfil',
  monthlyHours: 'as horas mensais',
  extraHourPrice: 'o valor da hora extra',
};

function rotulo(propriedade: string): string {
  return ROTULOS[propriedade] ?? `o campo "${propriedade}"`;
}

/** "o título" -> "O título", para começar frase. */
function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Texto padrão do class-validator: inglês, só ASCII, com "must"/"should".
 * Mensagem escrita à mão no projeto é português e não casa.
 */
function ehPadraoEmIngles(mensagem: string): boolean {
  return (
    /^[\x20-\x7E]*$/.test(mensagem) &&
    /\b(must|should|has to)\b/i.test(mensagem)
  );
}

/** O número que o class-validator põe na frase ("... equal to 2 characters"). */
function numeroDa(mensagem: string): string | null {
  const m = mensagem.match(/(-?\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function vazio(valor: unknown): boolean {
  return (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '')
  );
}

function traduzir(
  regra: string,
  mensagemOriginal: string,
  propriedade: string,
  valor: unknown,
): string {
  const campo = rotulo(propriedade);
  const Campo = comMaiuscula(campo);
  const n = numeroDa(mensagemOriginal);

  switch (regra) {
    case 'isNotEmpty':
    case 'isDefined':
      return `Preencha ${campo}.`;
    case 'minLength':
      // O caso da captura de tela: salvar sem descrição. "Pelo menos 2
      // caracteres" para um campo vazio confunde — o que falta é preencher.
      if (vazio(valor)) return `Preencha ${campo}.`;
      return `${Campo} precisa ter pelo menos ${n ?? 'mais'} caracteres.`;
    case 'maxLength':
      return `${Campo} pode ter no máximo ${n ?? 'menos'} caracteres.`;
    case 'isLength':
      return `${Campo} está com um tamanho fora do permitido.`;
    case 'isEmail':
      return `${Campo} precisa ser um e-mail válido.`;
    case 'isInt':
    case 'isNumber':
    case 'isNumberString':
      return `${Campo} precisa ser um número.`;
    case 'min':
      return `${Campo} precisa ser no mínimo ${n ?? 'maior'}.`;
    case 'max':
      return `${Campo} pode ser no máximo ${n ?? 'menor'}.`;
    case 'isPositive':
      return `${Campo} precisa ser maior que zero.`;
    case 'isString':
      return `${Campo} precisa ser um texto.`;
    case 'isBoolean':
      return `${Campo} precisa ser sim ou não.`;
    case 'isUuid':
      return `${Campo} tem um identificador inválido.`;
    case 'isIn':
    case 'isEnum':
      return `O valor escolhido para ${campo} não é uma das opções aceitas.`;
    case 'isDateString':
    case 'isDate':
    case 'isIso8601':
      return `${Campo} precisa ser uma data válida.`;
    case 'matches':
      return `${Campo} está em um formato inválido.`;
    case 'isArray':
      return `${Campo} precisa ser uma lista.`;
    case 'arrayMinSize':
    case 'arrayNotEmpty':
      return n && regra === 'arrayMinSize' && n !== '1'
        ? `${Campo} precisa ter pelo menos ${n} itens.`
        : `${Campo} precisa ter pelo menos um item.`;
    case 'arrayMaxSize':
      return `${Campo} pode ter no máximo ${n ?? 'menos'} itens.`;
    case 'isUrl':
      return `${Campo} precisa ser um endereço (URL) válido.`;
    case 'isObject':
      return `${Campo} está em um formato inválido.`;
    case 'whitelistValidation':
      // forbidNonWhitelisted: veio um campo que a rota não conhece.
      return `${Campo} não é aceito aqui.`;
    default:
      return `${Campo} está inválido.`;
  }
}

function coletar(erro: ValidationError, saida: string[]): void {
  for (const [regra, mensagem] of Object.entries(erro.constraints ?? {})) {
    saida.push(
      ehPadraoEmIngles(mensagem)
        ? traduzir(regra, mensagem, erro.property, erro.value)
        : mensagem,
    );
  }
  // Objeto ou lista aninhada: o erro fica nos filhos.
  for (const filho of erro.children ?? []) coletar(filho, saida);
}

/** Todas as mensagens, na mesma ordem do class-validator, sem repetir. */
export function mensagensDeValidacao(erros: ValidationError[]): string[] {
  const saida: string[] = [];
  for (const erro of erros) coletar(erro, saida);
  return [...new Set(saida)];
}

/** A primeira mensagem, para as rotas que validam à mão e mostram uma só. */
export function primeiraMensagemDeValidacao(
  erros: ValidationError[],
  seNaoHouver: string,
): string {
  return mensagensDeValidacao(erros)[0] ?? seNaoHouver;
}
