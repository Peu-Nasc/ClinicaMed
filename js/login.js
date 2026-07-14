import { showToast } from './Ferramentas.js';
// Importamos a instância de autenticação do nosso novo arquivo
import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase.js';
import { carregarPacientes, carregarProfissionais } from './pacientes.js'; 
import { carregarAgendamentos } from './agenda.js';
import { carregarFinanceiro } from './financeiro.js';
import { carregarEstoque } from './estoque.js';

export function initAuth() {
    const formLogin = document.getElementById('form-login');
    const loginScreen = document.getElementById('login-screen');
    const btnSolicitarAcesso = document.getElementById('btn-solicitar-acesso');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginScreen.classList.remove('active');
            loginScreen.style.display = 'none';
            
            // Lógica dinâmica para o nome do usuário
            const userNameEl = document.getElementById('profile-user-name');
            if (userNameEl && user.email) {
                // Pega a parte do e-mail antes do @ (ex: dr.joao@clinica.com vira "dr.joao")
                let nome = user.email.split('@')[0];
                // Deixa a primeira letra maiúscula
                nome = nome.charAt(0).toUpperCase() + nome.slice(1);
                userNameEl.textContent = 'Olá, ' + nome;
            }
            
            carregarPacientes(); 
            carregarProfissionais();
            carregarAgendamentos();
            carregarFinanceiro();
            carregarEstoque();
        } else {
            loginScreen.style.display = 'flex';
            setTimeout(() => loginScreen.classList.add('active'), 10);
        }
    });

    // 1. Observador de Sessão: Verifica se o usuário já está logado ao abrir a página
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Usuário já tem token válido, removemos a tela de login
            loginScreen.classList.remove('active');
            loginScreen.style.display = 'none';
        } else {
            // Sem sessão, mostramos a tela de login
            loginScreen.style.display = 'flex';
            setTimeout(() => loginScreen.classList.add('active'), 10);
        }
    });

    // 2. Fluxo de Login Real
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const senha = document.getElementById('login-senha').value;
        const btn = formLogin.querySelector('button[type="submit"]');
        const textoOriginal = btn.innerHTML;
        
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...';
        btn.disabled = true;

        try {
            // Envia as credenciais para o Firebase
            await signInWithEmailAndPassword(auth, email, senha);
            
            loginScreen.style.opacity = '0';
            loginScreen.style.transition = 'opacity 0.5s ease';
            
            setTimeout(() => {
                loginScreen.classList.remove('active');
                loginScreen.style.display = 'none';
                loginScreen.style.opacity = '1'; // Reseta para futuros logouts
            }, 500);

            showToast('Acesso autorizado.', 'success');
            
        } catch (error) {
            console.error("Erro no login:", error.code);
            showToast('Credenciais inválidas ou acesso negado.', 'error');
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    });

    btnSolicitarAcesso.addEventListener('click', () => {
        const mensagem = encodeURIComponent("Olá JS Ferreira, gostaria de solicitar minhas credenciais de acesso ao sistema ERP.");
        window.open(`https://wa.me/5575981701297?text=${mensagem}`, '_blank');
    });

    // 3. Botão de Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                // Informa ao Firebase para destruir a sessão atual
                await signOut(auth);
                
                // Recarrega a página forçadamente para limpar toda a memória RAM (clinicaState)
                // e garantir que o próximo usuário pegue o sistema do zero.
                window.location.reload(); 
            } catch (error) {
                console.error("Erro ao fazer logout:", error);
                showToast('Erro ao tentar encerrar a sessão.', 'error');
            }
        });
    }
}