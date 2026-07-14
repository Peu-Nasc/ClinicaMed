// Precisamos importar o que formos usar de outros módulos, se necessário
import { calcularDRE } from './financeiro.js';
import { atualizarAgenda } from './agenda.js';
import { verificarAlertasEstoque } from './estoque.js';

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
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
            
            const target = e.currentTarget.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            e.currentTarget.classList.add('active');
            fecharMenuMobile();
            
            // Dispara funções específicas ao trocar de aba
            if (target === 'estoque') verificarAlertasEstoque();
            if (target === 'dashboard') calcularDRE();
            if (target === 'agenda') atualizarAgenda();
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
    // Lógica para fechar modais no ESC ou clique fora...
}