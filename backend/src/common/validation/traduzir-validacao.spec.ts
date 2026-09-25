import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTicketDto } from '../../modules/tickets/tickets-create.dto';
import {
  mensagensDeValidacao,
  primeiraMensagemDeValidacao,
} from './traduzir-validacao';

/** Chamado válido; cada teste estraga só o campo que quer ver. */
const valido = {
  title: 'Servidor fora do ar',
  description: 'O servidor parou de responder às 8h.',
  clientId: 1,
  deskId: 1,
  requestorName: 'Cliente',
  requestorEmail: 'cliente@empresa.com.br',
};

async function mensagens(dados: Record<string, unknown>) {
  const dto = plainToInstance(CreateTicketDto, dados);
  return mensagensDeValidacao(await validate(dto));
}

describe('tradução das mensagens de validação', () => {
  it('chamado sem descrição pede para preencher, em português', async () => {
    // O erro da captura de tela: "description must be longer than or equal
    // to 2 characters".
    const msgs = await mensagens({ ...valido, description: '' });
    expect(msgs).toContain('Preencha a descrição.');
    expect(msgs.join(' ')).not.toMatch(/must|should|characters/);
  });

  it('texto curto demais diz o mínimo', async () => {
    const msgs = await mensagens({ ...valido, title: 'X' });
    expect(msgs).toContain('O título precisa ter pelo menos 2 caracteres.');
  });

  it('e-mail inválido', async () => {
    const msgs = await mensagens({ ...valido, requestorEmail: 'nao-e-email' });
    expect(msgs).toContain(
      'O e-mail do solicitante precisa ser um e-mail válido.',
    );
  });

  it('mensagem que já estava em português fica como está', async () => {
    // A descrição tem MaxLength com mensagem escrita à mão.
    const msgs = await mensagens({ ...valido, description: 'a'.repeat(50_001) });
    expect(msgs.join(' ')).toContain('A descrição passou do limite de 50 mil');
  });

  it('nenhuma mensagem sai em inglês para um chamado todo errado', async () => {
    const msgs = await mensagens({
      title: '',
      description: '',
      clientId: 'abc',
      deskId: null,
      requestorName: '',
      requestorEmail: 'x',
    });
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(m).not.toMatch(/\b(must|should|has to)\b/i);
    }
  });

  it('campo desconhecido é recusado em português (forbidNonWhitelisted)', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (erros) =>
        new BadRequestException(mensagensDeValidacao(erros)),
    });
    let resposta: unknown;
    try {
      await pipe.transform(
        { ...valido, campoInventado: 1 },
        { type: 'body', metatype: CreateTicketDto },
      );
    } catch (err) {
      resposta = (err as BadRequestException).getResponse();
    }
    // Mesmo formato de antes: lista em `message`. A tela já sabe ler assim.
    expect(resposta).toMatchObject({
      statusCode: 400,
      message: ['O campo "campoInventado" não é aceito aqui.'],
    });
  });

  it('primeira mensagem, para as rotas que validam à mão', async () => {
    const dto = plainToInstance(CreateTicketDto, { ...valido, description: '' });
    const erros = await validate(dto);
    expect(primeiraMensagemDeValidacao(erros, 'reserva')).toBe(
      'Preencha a descrição.',
    );
    expect(primeiraMensagemDeValidacao([], 'reserva')).toBe('reserva');
  });
});
