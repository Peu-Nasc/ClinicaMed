import { showToast } from './Ferramentas.js';
import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, db, collection, query, where, getDocs } from './firebase.js';
import { clinicaState } from './state.js'; // Adicione esta linha!
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
            // 1. Envia as credenciais para o Firebase
            const userCredential = await signInWithEmailAndPassword(auth, email, senha);
            const user = userCredential.user;

            // 2. Procura qual é o perfil desse e-mail na sua coleção de controle
            const q = query(collection(db, "usuarios"), where("email", "==", user.email));
            const querySnapshot = await getDocs(q);
            
            let dadosUsuario = { perfil: 'admin', clinicaId: 'clinica-padrao', nome: user.email.split('@')[0] }; // Fallback de segurança

            if (!querySnapshot.empty) {
                // Se achou no banco, pega as permissões reais
                dadosUsuario = querySnapshot.docs[0].data();
            } else {
                // Se não achou a pessoa cadastrada, bloqueia o acesso!
                showToast('Usuário sem permissão vinculada a uma clínica.', 'error');
                await signOut(auth);
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
                return; 
            }

            // 3. Salva na memória do sistema
            clinicaState.sessao.uid = user.uid;
            clinicaState.sessao.email = user.email;
            clinicaState.sessao.nome = dadosUsuario.nome;
            clinicaState.sessao.perfil = dadosUsuario.perfil;
            clinicaState.sessao.clinicaId = dadosUsuario.clinicaId;

            // 4. Aplica as travas visuais (Oculta os menus)
            aplicarPermissoesDeTela();

            loginScreen.style.opacity = '0';
            loginScreen.style.transition = 'opacity 0.5s ease';
            
            setTimeout(() => {
                loginScreen.classList.remove('active');
                loginScreen.style.display = 'none';
                loginScreen.style.opacity = '1';
            }, 500);
            
            showToast(`Bem-vindo, ${dadosUsuario.nome}! Acesso: ${dadosUsuario.perfil.toUpperCase()}`, 'success');

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

// === MOTOR DE CONTROLE DE ACESSO (RBAC) ===
function aplicarPermissoesDeTela() {
    const perfil = clinicaState.sessao.perfil;
    const userNameEl = document.getElementById('profile-user-name');
    
    if (userNameEl) {
        let nomeFormatado = clinicaState.sessao.nome;
        userNameEl.textContent = 'Olá, ' + nomeFormatado.charAt(0).toUpperCase() + nomeFormatado.slice(1);
    }

    // Pega todos os botões do menu lateral
    const btnDash = document.querySelector('.menu-btn[data-target="dashboard"]');
    const btnFin = document.querySelector('.menu-btn[data-target="financeiro"]');
    const btnEst = document.querySelector('.menu-btn[data-target="estoque"]');
    
    // Reseta todos para visível primeiro
    if(btnDash) btnDash.style.display = 'flex';
    if(btnFin) btnFin.style.display = 'flex';
    if(btnEst) btnEst.style.display = 'flex';

    // Regras de Bloqueio
    if (perfil === 'medico') {
        // Médico não vê finanças, nem estoque, nem dashboard geral
        if(btnDash) btnDash.style.display = 'none';
        if(btnFin) btnFin.style.display = 'none';
        if(btnEst) btnEst.style.display = 'none';
        
        // Força a tela inicial dele ser a Agenda
        document.querySelector('.menu-btn[data-target="agenda"]').click();
    } 
    else if (perfil === 'recepcao') {
        // Recepção não vê dashboard nem financeiro
        if(btnDash) btnDash.style.display = 'none';
        if(btnFin) btnFin.style.display = 'none';
        
        // Força a tela inicial ser a Agenda
        document.querySelector('.menu-btn[data-target="agenda"]').click();
    }
}