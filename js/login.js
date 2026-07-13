import { showToast } from './Ferramentas.js';
// Importamos a instância de autenticação do nosso novo arquivo
import { auth, signInWithEmailAndPassword, onAuthStateChanged } from './firebase.js';

import { carregarPacientes, carregarProfissionais } from './pacientes.js'; 

import { carregarAgendamentos } from './agenda.js';

export function initAuth() {
    const formLogin = document.getElementById('form-login');
    const loginScreen = document.getElementById('login-screen');
    const btnSolicitarAcesso = document.getElementById('btn-solicitar-acesso');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginScreen.classList.remove('active');
            loginScreen.style.display = 'none';
            
            // 2. Chame a função AQUI. O sistema só busca dados após confirmar o usuário
            carregarPacientes(); 
            carregarProfissionais();
            carregarAgendamentos()
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
        const mensagem = encodeURIComponent("Olá, gostaria de solicitar minhas credenciais de acesso ao sistema ERP.");
        window.open(`https://wa.me/5511999999999?text=${mensagem}`, '_blank');
    });
}