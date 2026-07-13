import { clinicaState } from './state.js';
import { showToast } from './Ferramentas.js';

import { db, collection, addDoc, getDocs, doc, deleteDoc } from './firebase.js';

const appointmentTimes = ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00'];

export function initAgenda() {
    const modalAgenda = document.getElementById('modal-agendamento');
    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');
    
    inputDataAgenda.value = new Date().toISOString().split('T')[0];
    
    document.getElementById('btn-novo-agendamento').addEventListener('click', () => abrirModalAgendamento());
    document.getElementById('btn-close-agendamento').addEventListener('click', () => modalAgenda.classList.remove('active'));
    
    inputDataAgenda.addEventListener('change', atualizarAgenda);
    filtroProfissional.addEventListener('change', atualizarAgenda);

    document.getElementById('form-agendamento').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');
        const textoOriginal = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Agendando...';
        btnSalvar.disabled = true;

        const pacId = document.getElementById('agenda-paciente').value;
        const profId = document.getElementById('agenda-profissional').value;
        
        // Pega o nome do paciente usando String() para não ter o bug de IDs
        const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacId));

        try {
            await addDoc(collection(db, "agendamentos"), {
                pacId: String(pacId),
                pacNome: paciente ? paciente.nome : 'Paciente',
                profId: String(profId),
                data: document.getElementById('agenda-data').value,
                hora: document.getElementById('agenda-hora').value
            });
            
            modalAgenda.classList.remove('active');
            e.target.reset();
            showToast('Consulta agendada com sucesso!');
            
            // Recarrega a nuvem para atualizar a tela
            await carregarAgendamentos(); 
        } catch (error) {
            console.error("Erro ao agendar: ", error);
            showToast('Falha de conexão ao agendar.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    // Lógica para Cancelar Consulta (Excluir do Banco)
    const agendaContainer = document.getElementById('agenda-professionals');
    if (agendaContainer) {
        agendaContainer.addEventListener('click', async (e) => {
            const btnCancelar = e.target.closest('.btn-cancelar-consulta');
            if (btnCancelar) {
                e.stopPropagation(); // Evita que o clique abra o modal de novo agendamento
                
                if (confirm('Deseja realmente cancelar esta consulta?')) {
                    const idAgendamento = btnCancelar.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "agendamentos", idAgendamento));
                        showToast('Consulta cancelada com sucesso.', 'success');
                        await carregarAgendamentos();
                    } catch (error) {
                        console.error("Erro ao cancelar: ", error);
                        showToast('Erro ao remover agendamento.', 'error');
                    }
                }
            }
        });
    }
}

export function abrirModalAgendamento(hora = '', profId = '', data = '') {
    const modalAgenda = document.getElementById('modal-agendamento');
    const selPac = document.getElementById('agenda-paciente');
    const selProf = document.getElementById('agenda-profissional');
    const inputDataAgenda = document.getElementById('data-agenda');
    
    selPac.innerHTML = clinicaState.pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    selProf.innerHTML = clinicaState.profissionais.map(p => `<option value="${p.id}">${p.nome} (${p.especialidade})</option>`).join('');
    
    if(data) document.getElementById('agenda-data').value = data;
    else document.getElementById('agenda-data').value = inputDataAgenda.value;
    
    if(hora) document.getElementById('agenda-hora').value = hora;
    if(profId) selProf.value = profId;
    
    modalAgenda.classList.add('active');
}

export function atualizarAgenda() {
    const container = document.getElementById('agenda-professionals');
    if (!container) return;
    
    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');
    
    const dataSelecionada = inputDataAgenda.value;
    const filtro = filtroProfissional.value;
    
    filtroProfissional.innerHTML = `<option value="todos">Todos os Profissionais</option>` + 
        clinicaState.profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    filtroProfissional.value = filtro;
    
    container.innerHTML = '';
    
    const profsParaExibir = filtro === 'todos' 
        ? clinicaState.profissionais 
        : clinicaState.profissionais.filter(p => p.id == filtro);
        
    if (profsParaExibir.length === 0) {
        container.innerHTML = `
            <div class="professional-column empty-column">
                <div class="prof-header">
                    <strong>Sem Profissionais</strong>
                    <small>Cadastre um médico para gerar a agenda</small>
                </div>
            </div>`;
        return;
    }
    
    profsParaExibir.forEach(prof => {
        const coluna = document.createElement('div');
        coluna.className = 'professional-column';
        coluna.innerHTML = `<div class="prof-header"><strong>${prof.nome}</strong><small>${prof.especialidade}</small></div>`;
        
        appointmentTimes.forEach(hora => {
            const agendamento = clinicaState.agenda.agendamentos.find(a => 
                a.profId == prof.id && a.data === dataSelecionada && a.hora === hora
            );
            
            const slot = document.createElement('div');
            if (agendamento) {
                    slot.className = 'appointment-slot occupied';
                    slot.dataset.status = 'confirmado';
                    slot.innerHTML = `
                        <p class="patient-name">${agendamento.pacNome}</p>
                        <span class="appointment-type">Consulta</span>
                        <button class="btn-cancelar-consulta" data-id="${agendamento.id}" style="font-size: 0.75rem; margin-top: 5px; color: #dc3545; background: none; border: none; cursor: pointer; text-decoration: underline;">
                            Cancelar
                        </button>
                    `;
            } else {
                slot.className = 'appointment-slot empty';
                slot.textContent = 'Livre';
                slot.addEventListener('click', () => abrirModalAgendamento(hora, prof.id, dataSelecionada));
            }
            coluna.appendChild(slot);
        });
        container.appendChild(coluna);
    });
}

export async function carregarAgendamentos() {
    try {
        const querySnapshot = await getDocs(collection(db, "agendamentos"));
        clinicaState.agenda.agendamentos = []; 
        
        querySnapshot.forEach((doc) => {
            clinicaState.agenda.agendamentos.push({
                ...doc.data(),
                id: String(doc.id) // Sempre garantindo o ID como texto
            });
        });
        
        atualizarAgenda(); // Desenha a grade de horários
        
    } catch (error) {
        console.error("Erro ao buscar agenda: ", error);
        showToast('Erro ao carregar agendamentos.', 'error');
    }
}