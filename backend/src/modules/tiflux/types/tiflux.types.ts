export interface TifluxTicket {
  id: number;
  subject: string;
  status: string;
  created_at: string;
}

export interface TifluxAppointment {
  id: number;
  duration: number;
  date: string;
}
