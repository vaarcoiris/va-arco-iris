# 🌈 VA'ARCO-ÍRIS Dashboard: CLAUDE.md

> [!IMPORTANT]
> **ISOLAMENTO DE CONTAS**: Este projeto pertence às contas exclusivas da equipe **Va'arco-íris**. 
> Sempre que for trabalhar neste repositório, certifique-se de estar logado nas contas corretas. Quando terminar, você pode voltar para as suas contas pessoais.

## 🔄 Como alternar as contas (Comandos)

### Vercel
* **Entrar na conta da Va'arco-íris**:
  ```bash
  vercel logout
  vercel login
  # Selecione "Continue with GitHub" e autorize com a conta vaarcoris no navegador.
  ```
* **Voltar para sua conta pessoal**:
  ```bash
  vercel logout
  vercel login
  # Selecione seu método de login pessoal (ex: carlosmele0) no navegador.
  ```

### GitHub
* **Verificar conta atual**: `gh auth status`
* **Logar na conta vaarcoris**: `gh auth login`
* **Deslogar**: `gh auth logout`

---

## 🛠 Comandos Úteis do Projeto
* **Rodar localmente**: `npm run dev`
* **Compilar (Build local)**: `npm run build`
* **Deploy manual para Produção na Vercel**: `vercel deploy --prod --yes`
* **Atualizar repositório local com remoto**: `git pull origin main`
* **Enviar alterações locais**: `git add . && git commit -m "..." && git push origin main`
