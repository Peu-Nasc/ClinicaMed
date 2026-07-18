import { clinicaState } from './state.js';
import { showToast } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from './firebase.js';

const appointmentTimes = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

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
        const dataAgendamento = document.getElementById('agenda-data').value;
        const horaAgendamento = document.getElementById('agenda-hora').value;
        const paciente = clinicaState.pacientes.find(p => String(p.id) === String(pacId));

        // SISTEMA DE BLOQUEIO (Impede choque de horários)
        const horarioOcupado = clinicaState.agenda.agendamentos.find(a => 
            a.profId === String(profId) && 
            a.data === dataAgendamento && 
            a.hora === horaAgendamento
        );

        if (horarioOcupado) {
            showToast('Atenção: Este médico já possui um paciente agendado neste horário!', 'error');
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
            return; 
        }

        try {
            await addDoc(collection(db, "agendamentos"), {
                pacId: String(pacId),
                pacNome: paciente ? paciente.nome : 'Paciente',
                profId: String(profId),
                data: dataAgendamento,
                hora: horaAgendamento,
                tipo: document.getElementById('agenda-tipo').value,
                status: 'aguardando', 
                clinicaId: clinicaState.sessao.clinicaId
            });
            
            modalAgenda.classList.remove('active');
            e.target.reset();
            showToast('Consulta agendada com sucesso!', 'success');
            
            await carregarAgendamentos(); 
        } catch (error) {
            console.error("Erro ao agendar: ", error);
            showToast('Falha de conexão ao agendar.', 'error');
        } finally {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        }
    });

    const agendaContainer = document.getElementById('agenda-professionals');
    if (agendaContainer) {
        agendaContainer.addEventListener('click', async (e) => {
            const btnCancelar = e.target.closest('.btn-cancelar-consulta');
            if (btnCancelar) {
                e.stopPropagation();
                if (confirm('Deseja realmente cancelar esta consulta?')) {
                    const idAgendamento = btnCancelar.getAttribute('data-id');
                    try {
                        await deleteDoc(doc(db, "agendamentos", idAgendamento));
                        showToast('Consulta cancelada.', 'success');
                        await carregarAgendamentos();
                    } catch (error) {
                        console.error("Erro ao cancelar: ", error);
                        showToast('Erro ao remover agendamento.', 'error');
                    }
                }
            }
        });

        agendaContainer.addEventListener('change', async (e) => {
            if (e.target.classList.contains('select-status-agenda')) {
                const novoStatus = e.target.value;
                const idAgendamento = e.target.getAttribute('data-id');
                
                try {
                    await updateDoc(doc(db, "agendamentos", idAgendamento), { status: novoStatus });
                    showToast('Status atualizado!', 'success');
                    await carregarAgendamentos(); 
                } catch (error) {
                    console.error("Erro ao atualizar status: ", error);
                    showToast('Erro ao atualizar.', 'error');
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
    
    // === TRAVA DO DOUTOR: NOVO AGENDAMENTO ===
    let profsPermitidos = clinicaState.profissionais;
    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
    }

    selPac.innerHTML = clinicaState.pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    selProf.innerHTML = profsPermitidos.map(p => `<option value="${p.id}">${p.nome} (${p.especialidade})</option>`).join('');
    
    // Bloqueia visualmente o campo se for médico
    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        selProf.style.pointerEvents = 'none';
        selProf.style.backgroundColor = '#e2e8f0';
    } else {
        selProf.style.pointerEvents = 'auto';
        selProf.style.backgroundColor = '';
    }
    
    if(data) document.getElementById('agenda-data').value = data;
    else document.getElementById('agenda-data').value = inputDataAgenda.value;
    
    const selectHora = document.getElementById('agenda-hora');
    if(hora) selectHora.value = hora; 
    else selectHora.value = ""; 
    
    if(profId) selProf.value = profId;
    
    modalAgenda.classList.add('active');
}

export function atualizarAgenda() {
    const container = document.getElementById('agenda-professionals');
    const colHorarios = document.getElementById('time-column-slots');
    if (!container || !colHorarios) return;
    
    colHorarios.innerHTML = `<div class="time-slot-header">Horário</div>` + 
        appointmentTimes.map(h => `<div class="time-slot">${h}</div>`).join('');

    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');
    
    const dataSelecionada = inputDataAgenda.value;
    
    // === TRAVA DO DOUTOR: COLUNAS DA AGENDA ===
    let profsPermitidos = clinicaState.profissionais;
    let mostrarTodos = true;

    if (clinicaState.sessao.perfil === 'Doutor(a)') {
        profsPermitidos = clinicaState.profissionais.filter(p => p.nome.trim().toLowerCase() === clinicaState.sessao.nome.trim().toLowerCase());
        mostrarTodos = false;
    }

    // Configura o Dropdown de Filtro da Tabela
    let opcoesFiltro = '';
    if (mostrarTodos) opcoesFiltro += `<option value="todos">Todos os Profissionais</option>`;
    opcoesFiltro += profsPermitidos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    
    // Mantém o valor anterior selecionado, se possível
    const valorAnterior = filtroProfissional.value;
    filtroProfissional.innerHTML = opcoesFiltro;
    if (mostrarTodos && valorAnterior) filtroProfissional.value = valorAnterior;
    
    container.innerHTML = '';
    let filtroAtual = filtroProfissional.value;
    
    const profsParaExibir = filtroAtual === 'todos' 
        ? profsPermitidos 
        : profsPermitidos.filter(p => p.id == filtroAtual);
        
    if (profsParaExibir.length === 0) {
        container.innerHTML = `
            <div class="professional-column empty-column">
                <div class="prof-header">
                    <strong>Sem Profissionais</strong>
                    <small>Seu usuário não está vinculado à lista de profissionais.</small>
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
                    const statusAtual = agendamento.status || 'aguardando';
                    slot.className = 'appointment-slot occupied';
                    slot.dataset.status = statusAtual; 
                    
                    slot.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <p class="patient-name">${agendamento.pacNome}</p>
                            <button class="btn-cancelar-consulta" data-id="${agendamento.id}" title="Cancelar Horário" style="color: #dc3545; background: none; border: none; cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                        <span class="appointment-type" style="margin-bottom: 5px; display: block;">${agendamento.tipo || 'Consulta'}</span>
                        
                        <select class="select-status-agenda input-premium" data-id="${agendamento.id}" style="font-size: 0.75rem; padding: 2px 5px; height: 26px; cursor: pointer;">
                            <option value="aguardando" ${statusAtual === 'aguardando' ? 'selected' : ''}>⏳ Aguardando</option>
                            <option value="confirmado" ${statusAtual === 'confirmado' ? 'selected' : ''}>✅ Confirmado (Chegou)</option>
                            <option value="em-atendimento" ${statusAtual === 'em-atendimento' ? 'selected' : ''}>👨‍⚕️ Em Atendimento</option>
                        </select>
                    `;
            } else {
                slot.className = 'appointment-slot empty';
                slot.textContent = 'Horário Livre';
                slot.addEventListener('click', () => abrirModalAgendamento(hora, prof.id, dataSelecionada));
            }
            coluna.appendChild(slot);
        });
        container.appendChild(coluna);
    });
}

export async function carregarAgendamentos() {
    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.agenda.agendamentos = [];
                  
        querySnapshot.forEach((doc) => {
            clinicaState.agenda.agendamentos.push({
                ...doc.data(),
                id: String(doc.id) 
            });
        });
        
        atualizarAgenda(); 
             
    } catch (error) {
        console.error("Erro ao buscar agenda: ", error);
        showToast('Erro ao carregar agendamentos.', 'error');
    }
}