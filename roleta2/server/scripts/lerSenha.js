/**
 * lerSenha.js — leitura de senha do terminal sem eco.
 *
 * Existe para a senha NÃO precisar ir como argumento de linha de comando:
 * argumento fica no histórico do shell e aparece no `ps` para qualquer processo
 * da máquina — numa VPS, é a senha do painel administrativo à vista.
 *
 * A máquina de estados fica separada do stdin de propósito. A primeira versão
 * disto misturava as duas coisas e nasceu com um bug que só apareceu em
 * produção: a conta foi criada com uma senha diferente da que a pessoa digitou.
 * Agora a lógica é testável sem TTY (tests/unit/lerSenha.test.js).
 */

/**
 * Cria a máquina de estados que transforma teclas em senha.
 *
 * @param {(senha: string) => void} aoConfirmar  chamado no Enter
 * @param {() => void} aoCancelar                chamado no Ctrl+C
 * @returns {(chunk: string) => void}            alimente com o que vier do stdin
 */
export function criarLeitorDeTeclas(aoConfirmar, aoCancelar) {
  let senha = '';
  let encerrado = false;

  // Teclas de navegação (setas, Home, F1…) chegam como sequência de escape:
  // ESC + '[' + letra final. O ESC sozinho já é descartado por ser caractere de
  // controle, mas o "[D" que vem atrás é imprimível e entraria na senha.
  let dentroDeEscape = false;

  return function alimentar(chunk) {
    // Um único evento do stdin em raw mode pode trazer VÁRIOS caracteres:
    // digitação rápida, tecla repetindo, ou a senha colada de uma vez. Tratar o
    // chunk como se fosse um caractere só fazia o Enter que vinha junto com as
    // últimas letras não ser reconhecido — ele entrava na senha como "\r".
    for (const ch of String(chunk)) {
      if (encerrado) return;

      if (dentroDeEscape) {
        if (/[A-Za-z~]/.test(ch)) dentroDeEscape = false;   // fim da sequência
        continue;
      }
      if (ch === '') { dentroDeEscape = true; continue; }

      switch (ch) {
        case '\n': case '\r': case '':   // Enter / EOF
          encerrado = true;
          aoConfirmar(senha);
          return;

        case '':                          // Ctrl+C
          encerrado = true;
          aoCancelar();
          return;

        case '': case '\b':               // Backspace
          senha = senha.slice(0, -1);
          break;

        default:
          if (ch >= ' ') senha += ch;           // ignora os demais controles
      }
    }
  };
}

/** Lê a senha do stdin. Sem TTY (pipe, CI), lê a linha normalmente. */
export function lerSenhaOculta(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      let buffer = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', c => { buffer += c; });
      process.stdin.on('end', () => resolve(buffer.trim()));
      process.stdin.on('error', reject);
      return;
    }

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const finalizar = (fn, arg) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', alimentar);
      process.stdout.write('\n');
      fn(arg);
    };

    const alimentar = criarLeitorDeTeclas(
      senha => finalizar(resolve, senha),
      ()    => finalizar(reject, new Error('cancelado')),
    );

    process.stdin.on('data', alimentar);
  });
}
