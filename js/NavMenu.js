// Precisamos importar o que formos usar de outros módulos, se necessário
import { clinicaState } from './state.js';
import { showToast } from './Ferramentas.js';
import { calcularDRE } from './financeiro.js';
import { atualizarAgenda } from './agenda.js';
import { verificarAlertasEstoque } from './estoque.js';
import { atualizarListaNotificacoes } from './notificacoes.js';
import { atualizarTabelaAuditoria } from './auditoria.js';

const TITULOS_CARD_INICIO = {
    dashboard: 'Dashboard & DRE',
    agenda: 'Agenda',
    pacientes: 'Pacientes & Prontuários',
    estoque: 'Estoque (Anvisa)',
    financeiro: 'Financeiro',
    notificacoes: 'Notificações',
    auditoria: 'Auditoria',
    ajuda: 'Ajuda'
};

const ICONES_CARD_INICIO = {
    dashboard: 'fa-solid fa-chart-line',
    agenda: 'fa-regular fa-calendar-days',
    pacientes: 'fa-solid fa-users',
    estoque: 'fa-solid fa-boxes-stacked',
    financeiro: 'fa-solid fa-cash-register',
    notificacoes: 'fa-solid fa-bell',
    auditoria: 'fa-solid fa-file-signature',
    ajuda: 'fa-solid fa-circle-question'
};

const DESCRICOES_CARD_INICIO = {
    dashboard: 'Resultado financeiro e indicadores gerais da clínica',
    agenda: 'Marcar, confirmar e acompanhar as consultas do dia',
    pacientes: 'Prontuários, histórico e cadastro de pacientes',
    estoque: 'Controle de medicamentos e materiais por lote',
    financeiro: 'Livro Caixa, Custos Fixos, Procedimentos e Pacotes',
    notificacoes: 'Pendências que precisam da sua atenção',
    auditoria: 'Histórico de ações realizadas no sistema',
    ajuda: 'Dúvidas rápidas sobre como usar o sistema'
};

// Tela de Início: um card de atalho pra cada módulo que o perfil logado
// efetivamente enxerga no menu lateral. Em vez de duplicar as regras de
// permissão aqui, a função só olha quais botões do menu já estão visíveis
// (aplicarPermissoesDeTela, em login.js, roda antes e decide isso) - então
// a tela de Início nunca fica dessincronizada de quem pode ver o quê.
export function renderizarCardsInicio() {
    const container = document.getElementById('inicio-cards');
    if (!container) return;

    const botoesVisiveis = Array.from(document.querySelectorAll('.menu-btn')).filter(btn => {
        const target = btn.getAttribute('data-target');
        if (target === 'inicio') return false;
        return window.getComputedStyle(btn).display !== 'none';
    });

    container.innerHTML = botoesVisiveis.map(btn => {
        const target = btn.getAttribute('data-target');
        return `
            <div class="card card-action inicio-card" data-target="${target}">
                <i class="${ICONES_CARD_INICIO[target] || 'fa-solid fa-circle'} hub-icon"></i>
                <h3>${TITULOS_CARD_INICIO[target] || target}</h3>
                <p class="top-subtitle mt-15">${DESCRICOES_CARD_INICIO[target] || ''}</p>
            </div>`;
    }).join('');

    container.querySelectorAll('.inicio-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelector(`.menu-btn[data-target="${card.dataset.target}"]`)?.click();
        });
    });
}

export function initUI() {
    const sidebar = document.getElementById('sidebar');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileBackdrop = document.getElementById('mobile-backdrop');

    function fecharMenuMobile() {
        if (sidebar) sidebar.classList.remove('active');
        if (mobileBackdrop) mobileBackdrop.classList.remove('active');
    }

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            mobileBackdrop.classList.toggle('active');
        });
    }

    if (mobileBackdrop) {
        mobileBackdrop.addEventListener('click', fecharMenuMobile);
    }

    // Lógica de navegação da SPA
    document.querySelectorAll('.menu-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');

            // Trava de acesso real (não só visual): mesmo que alguém force o
            // clique/hash pra "auditoria", só o Administrador consegue trocar
            // de fato de aba - os demais perfis nem veem o botão, mas essa
            // segunda barreira evita depender só do CSS/display do menu.
            if (target === 'auditoria' && clinicaState.sessao.perfil !== 'admin') {
                showToast('Acesso restrito ao Administrador.', 'error');
                return;
            }

            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
            
            document.getElementById(target).classList.add('active');
            e.currentTarget.classList.add('active');
            fecharMenuMobile();
            
            // Dispara funções específicas ao trocar de aba
            if (target === 'inicio') renderizarCardsInicio();
            if (target === 'estoque') verificarAlertasEstoque();
            if (target === 'dashboard') calcularDRE();
            if (target === 'agenda') atualizarAgenda();
            if (target === 'notificacoes') atualizarListaNotificacoes(document.getElementById('filtro-notificacoes')?.value || 'pendentes');
            if (target === 'auditoria') atualizarTabelaAuditoria();
        });
    });


    // === NAVEGAÇÃO INTERNA DO HUB DE PACIENTES/EQUIPE ===
    const hubPrincipal = document.getElementById('hub-principal');
    const areaPacientes = document.getElementById('area-pacientes');
    const areaProfissionais = document.getElementById('area-profissionais');

    document.getElementById('btn-hub-pacientes')?.addEventListener('click', () => {
        hubPrincipal.style.display = 'none';
        areaPacientes.style.display = 'block';
    });

    document.getElementById('btn-hub-profissionais')?.addEventListener('click', () => {
        if (clinicaState.sessao.perfil === 'Doutor(a)') {
            showToast('Gestão da equipe é restrita à Administração.', 'error');
            return;
        }
        hubPrincipal.style.display = 'none';
        areaProfissionais.style.display = 'block';
    });

    // Botões de voltar para a tela inicial dos botões grandes
    document.querySelectorAll('.btn-voltar-hub').forEach(btn => {
        btn.addEventListener('click', () => {
            areaPacientes.style.display = 'none';
            areaProfissionais.style.display = 'none';
            hubPrincipal.style.display = 'flex'; // Volta a mostrar os cards
            
            // Bônus: Se o prontuário estiver aberto, fecha ele ao voltar
            const pep = document.getElementById('prontuario-ativo');
            if (pep) pep.style.display = 'none';
        });
    });

    // === NAVEGAÇÃO INTERNA DO HUB FINANCEIRO (Livro Caixa / Custos Fixos) ===
    const hubFinanceiro = document.getElementById('hub-financeiro');
    const areaLivroCaixa = document.getElementById('area-livro-caixa');
    const areaCustosFixos = document.getElementById('area-custos-fixos');
    const areaProcedimentos = document.getElementById('area-procedimentos');
    const areaPacotes = document.getElementById('area-pacotes');

    document.getElementById('btn-hub-livro-caixa')?.addEventListener('click', () => {
        hubFinanceiro.style.display = 'none';
        areaLivroCaixa.style.display = 'block';
    });

    document.getElementById('btn-hub-custos-fixos')?.addEventListener('click', () => {
        hubFinanceiro.style.display = 'none';
        areaCustosFixos.style.display = 'block';
    });

    document.getElementById('btn-hub-procedimentos')?.addEventListener('click', () => {
        hubFinanceiro.style.display = 'none';
        areaProcedimentos.style.display = 'block';
    });

    document.getElementById('btn-hub-pacotes')?.addEventListener('click', () => {
        hubFinanceiro.style.display = 'none';
        areaPacotes.style.display = 'block';
    });

    document.querySelectorAll('.btn-voltar-hub-financeiro').forEach(btn => {
        btn.addEventListener('click', () => {
            areaLivroCaixa.style.display = 'none';
            areaCustosFixos.style.display = 'none';
            areaProcedimentos.style.display = 'none';
            areaPacotes.style.display = 'none';
            hubFinanceiro.style.display = 'flex';
        });
    });
    // Lógica para fechar modais no ESC ou clique fora...
}