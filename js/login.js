import { showToast, comEstadoDeCarregamento } from './Ferramentas.js';
import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut, db, collection, query, where, getDocs, addDoc } from './firebase.js';
import { clinicaState } from './state.js'; // Adicione esta linha!
import { carregarPacientes, carregarProfissionais } from './pacientes.js';
import { carregarAgendamentos, carregarBloqueios, verificarAlertasAgendamento } from './agenda.js';
import { carregarFinanceiro, carregarCustosFixos } from './financeiro.js';
import { escutarNotificacoes } from './notificacoes.js';
import { carregarEstoque } from './estoque.js';
import { carregarAuditoria, registrarAuditoria } from './auditoria.js';


export function initAuth() {
    const formLogin = document.getElementById('form-login');
    const loginScreen = document.getElementById('login-screen');
    const btnSolicitarAcesso = document.getElementById('btn-solicitar-acesso');

    // 1. Observador de Sessão ÚNICO E INTELIGENTE
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Vai no banco e busca o perfil e a clínica de quem está logado
            const q = query(collection(db, "usuarios"), where("email", "==", user.email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const dadosUsuario = querySnapshot.docs[0].data();
                
                // Restaura a memória do sistema ANTES de carregar as tabelas
                clinicaState.sessao.uid = user.uid;
                clinicaState.sessao.email = user.email;
                clinicaState.sessao.nome = dadosUsuario.nome;
                clinicaState.sessao.perfil = dadosUsuario.perfil;
                clinicaState.sessao.clinicaId = dadosUsuario.clinicaId;

                // Esconde as telas que não pode ver
                aplicarPermissoesDeTela(); 

                // AGORA SIM, com a clínica salva na memória, ele carrega os dados certos!
                await carregarProfissionais();
                await carregarAgendamentos();
                await carregarBloqueios();
                verificarAlertasAgendamento();
                escutarNotificacoes();
                // Pacientes carrega depois da agenda: o status "Ativo/Inativo" da
                // tabela é calculado a partir da última consulta de cada paciente.
                await carregarPacientes();
                await carregarCustosFixos();
                await carregarFinanceiro();
                await carregarEstoque();

                // Log de auditoria é restrito ao Administrador - evita leitura
                // desnecessária no Firestore para quem nunca vai ver a tela.
                if (clinicaState.sessao.perfil === 'admin') {
                    await carregarAuditoria();
                }
                
                // Remove a tela de login
                loginScreen.classList.remove('active');
                loginScreen.style.display = 'none';
            } else {
                // Prevenção de segurança se o usuário foi deletado do banco
                await signOut(auth);
            }
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

        await comEstadoDeCarregamento(btn, 'Autenticando...', async () => {
            try {
                // 1. Envia as credenciais para o Firebase
                const userCredential = await signInWithEmailAndPassword(auth, email, senha);
                const user = userCredential.user;

                // 2. Procura qual é o perfil desse e-mail na sua coleção de controle
                const q = query(collection(db, "usuarios"), where("email", "==", user.email));
                const querySnapshot = await getDocs(q);
                
                if (querySnapshot.empty) {
                    // Se o e-mail não estiver na tabela de permissões do Firebase, bloqueia na hora!
                    showToast('Acesso negado. Usuário sem perfil configurado no sistema.', 'error');
                    await signOut(auth);
                    return; 
                }

                // Pega as permissões que você configurou manualmente no Firebase
                const dadosUsuario = querySnapshot.docs[0].data();

                // 3. Salva na memória do sistema
                clinicaState.sessao.uid = user.uid;
                clinicaState.sessao.email = user.email;
                clinicaState.sessao.nome = dadosUsuario.nome;
                clinicaState.sessao.perfil = dadosUsuario.perfil;
                clinicaState.sessao.clinicaId = dadosUsuario.clinicaId;

                // 4. Aplica as travas visuais (Oculta os menus)
                aplicarPermissoesDeTela();

                // Assinatura digital do acesso - feito depois de aplicarPermissoesDeTela
                // porque já precisa de sessao.nome/perfil/clinicaId preenchidos
                await registrarAuditoria({
                    acao: 'Login',
                    modulo: 'Sistema',
                    descricao: `Login realizado (${dadosUsuario.perfil})`
                });

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
            }
        });
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
                // Registra a saída ANTES do signOut - depois disso a sessão
                // (nome/perfil/clinicaId) é zerada pelo reload da página.
                await registrarAuditoria({
                    acao: 'Logout',
                    modulo: 'Sistema',
                    descricao: 'Encerramento de sessão'
                });

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
    const btnAudit = document.getElementById('btn-menu-auditoria');
    
    // Reseta todos para visível primeiro
    if(btnDash) btnDash.style.display = 'flex';
    if(btnFin) btnFin.style.display = 'flex';
    if(btnEst) btnEst.style.display = 'flex';
    // Auditoria é o oposto dos outros: só aparece para o Administrador
    if(btnAudit) btnAudit.style.display = 'none';

    // Regras de Bloqueio
    if (perfil === 'Doutor(a)') {
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
    else if (perfil === 'admin') {
        // Só o Administrador tem acesso ao log de auditoria
        if(btnAudit) btnAudit.style.display = 'flex';
    }
}