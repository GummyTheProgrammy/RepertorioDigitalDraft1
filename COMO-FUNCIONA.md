# Como funciona o Repertório Digital

## Resumo

O Repertório Digital é uma aplicação web estática: HTML, CSS e JavaScript executados diretamente no navegador. O GitHub Pages hospeda e entrega esses arquivos, mas não executa um servidor da aplicação.

**Atualmente não existe uma base de dados online.** Bandas, músicas, repertórios e a sessão ficam no `localStorage` do navegador, sob o prefixo `repertorio-digital:v1:`. Esses dados ficam naquele navegador e naquela origem do site; não são sincronizados entre pessoas, computadores ou navegadores. Limpar os dados do site pode apagá-los.

## Peças da aplicação

- [`index.html`](./index.html): estrutura das telas, formulários e carregamento dos scripts.
- [`css/style.css`](./css/style.css): aparência da aplicação e layout de impressão.
- [`js/app.js`](./js/app.js): comportamento da interface — navegação, bandas, repertórios, músicas, filtros, importação e impressão.
- [`js/api.js`](./js/api.js): API simulada no próprio navegador; lê e grava os dados no `localStorage`.
- [`js/csv-schema.js`](./js/csv-schema.js): interpreta e normaliza cabeçalhos e dados de CSV.
- [`data/musicas.csv`](./data/musicas.csv): exemplo que pode ser carregado pela interface.

O `app.js` chama `window.RepertorioAPI`, implementada por `api.js`. Essa separação imita a divisão entre interface e API de um sistema online, mas **não cria um servidor nem uma base de dados**. As chamadas assíncronas e o pequeno atraso em `api.js` também são simulados.

## Como os dados são guardados

O `localStorage` armazena registros de usuários, bandas, músicas, repertórios e a sessão. É um armazenamento simples do navegador, não um banco de dados protegido:

- os dados não são criptografados pela aplicação;
- podem ser consultados ou alterados por ferramentas do navegador;
- ficam disponíveis a scripts executados na mesma origem;
- são separados por navegador, perfil e endereço (origem) do site.

A preferência de visualização do editor também é guardada localmente pelo `app.js`.

## Login de homologação

O acesso de homologação configurado é:

- **Login:** `adm`
- **Senha:** `adm`

A verificação é feita pelo JavaScript baixado para o navegador e não por um serviço de autenticação. A credencial é fixa e pode ser encontrada por qualquer pessoa que acesse o site e examine os arquivos. O cadastro de contas também é local ao navegador.

Portanto, esse login serve apenas para facilitar testes. Ele **não restringe o acesso ao site ou aos dados** e não deve ser considerado uma barreira de segurança.

## O que fica público no GitHub Pages

Quem conhece o endereço do site pode baixar os arquivos publicados. Isso inclui o HTML, CSS, JavaScript e o CSV de exemplo. GitHub Pages não oferece uma camada de autenticação de usuários da aplicação nem um local privado para guardar segredos.

O aplicativo também carrega PapaParse e fontes por serviços CDN externos, conforme as referências no `index.html`. Assim, ao abrir a página com internet, o navegador solicita esses recursos aos respectivos provedores.

## Riscos e limites importantes

1. **Acesso sem proteção real:** `adm` / `adm` está no código público. Uma pessoa pode inspecionar ou alterar o JavaScript e ignorar a tela de login.
2. **Dados locais e sem isolamento seguro por usuário:** os dados não vão para um servidor e a separação por usuário é apenas lógica no código do navegador. Não use a aplicação para guardar informações confidenciais ou que precisem de controle de acesso.
3. **Sem cópia central ou sincronização:** os dados não são automaticamente compartilhados nem recuperados em outro dispositivo. Exporte ou mantenha cópias dos CSVs importantes.
4. **Arquivos publicados são públicos:** não coloque senhas, chaves privadas, dados pessoais ou conteúdo confidencial no repositório ou nos arquivos servidos pelo Pages.
5. **Integridade local:** alguém com acesso ao mesmo perfil do navegador pode alterar ou apagar os dados pelo próprio navegador.

Para um sistema com usuários e dados protegidos, é necessário um backend com autenticação e autorização verificadas no servidor, banco de dados, regras de acesso por usuário e armazenamento seguro de credenciais. Esconder telas no JavaScript não substitui essas proteções.

## Fluxo para usar

1. Abra o endereço do GitHub Pages ou sirva os arquivos localmente por HTTP.
2. Para homologação, entre com `adm` / `adm` (ou crie uma conta local pela opção de cadastro).
3. Crie uma banda e, dentro dela, um repertório.
4. Adicione músicas pelo formulário, importe um CSV ou carregue o exemplo.
5. Monte e ordene o setlist; use a opção de impressão para gerar uma folha ou salvar como PDF.

## Abrir o Copilot Chat novamente no VS Code

No Windows/Linux, o atalho padrão para abrir o Chat é **Ctrl+Alt+I**. Também é possível abrir **Exibir → Chat** (ou clicar no ícone do Chat na barra lateral). Atalhos podem variar conforme a versão e as personalizações do VS Code; consulte **Arquivo → Preferências → Atalhos de Teclado** e pesquise por “Chat”.
