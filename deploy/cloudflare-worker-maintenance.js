/**
 * Worker de indisponibilidade do Portal Alle One.
 *
 * POR QUE EXISTE
 * Quando o portal cai, quem responde ao usuário é o Cloudflare, com a página
 * "Bad gateway / Error code 502" dele. Custom Error Pages resolveria isso, mas
 * exige plano Pro — o domínio está no Free. Um Worker faz o mesmo e está
 * incluído no Free.
 *
 * COMO SE COMPORTA
 * Todo request passa direto para a origem. Só quando a origem devolve 502/503/
 * 504, ou quando nem responde, é que a página de manutenção aparece.
 *
 * À PROVA DE FALHA
 * Este Worker fica na frente de TODO o tráfego do portal. Se qualquer coisa
 * aqui der errado, o catch externo devolve a resposta da origem assim mesmo —
 * o pior caso é o usuário voltar a ver a página do Cloudflare, nunca o site
 * sair do ar por culpa do Worker.
 *
 * O logo vai embutido em base64 de propósito: quando esta página aparece, não
 * há servidor de onde buscar imagem.
 *
 * NÃO EDITE ESTE ARQUIVO PARA COLAR NO CLOUDFLARE — ele é o template.
 * Use `cloudflare-worker-maintenance.js`, gerado com o logo já embutido.
 */

const LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABrCAYAAADNV78VAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAACbPSURBVHhe7Z0JmCRVle9BRUf04VMHEUUaquJGVbeKjPgcZxyFcX3izgwuo6MzMiPi+NxRB1Tcmfee6ICiIiICdldGrtULDc0yLS64wIAgKHbTlRG5Vq8sDc0ycO58/5snk5snIzMjq6uozK77+774ur+Mc29EVmb8895zzzl3v/0cDofD4XA4HA6Hw+FwOBwOh8PhcDgcDofD4XA4HA6Hw7HP4l2y6SC1dsezxzP153qrin+m0sWj/Uz5qIlC/YgVQelp+2n9GNnG4XA4FpwV6a1PVtnSy1W2dKqXraxS2fJ1KojqKlO6R6XDh1W6pFU64qN0nxeEO1W6fIuXji5V6ejfvGz5b1akq4fLfh0Oh2NeOHRN9UA/X32zylUvVtlqyV+9VU9evltPrr9LT6zdof3CrPZzNe1nK1pZh5+rar9Q1xNrtuuJS+80bSbW7dIQNy9TvsbP1z7u5beOy+s5HA7HwKjgj8/2c7XP+fna5ol1d+jJy+7W/vRWCI41ihr0KGk/XzPCBQFTueoeP1/Pernqq+X1lypa6ycT0dO01k+VBxE9XWv9JzFt9tdaP6VHO7x+gGzncIw8h6+8+al+rvpllavtmNxwj55Yvc0ITaf47P2BUZgZqa3ZoVW+dpXKVl4l72epQUQriWgrEc3GHNuI6F9i2jyRiK7r0Q6vv162czhGGj8TvnuiMDszueFeM9WTAtP1yJYbU0DrMFPDpKOxTElPrr/TTB/96fpK/+LbjpT3tlQgoit0D4joNNlGa30gEdWkrQ0RvU22czhGkiNX3XyIytdSjdHO9k5BEeICMZu4tDFNxL+Y5qkgfEgF0X04vHT4IERsYu1OY2P6Xb29IWKyP/vIlhtTxcLsTi8onSTvcylARJdKsbEhok/JNixYRWlrQ0R/I9s5HCPH+NTmv/QL9S0YVfUaEcGBbgQKgpYp11S2vFZlyl/wMtGJfip86UQwM6GC0rPNkY3GJjLRi7yp8A1+JvqYF0QXq0zpVpUp68nLdhtnfddrBaH2p7cZkVO52gWHnnf9gfKe92WcYDkcXfCmin/nT2+9z6zeBWGneECophurgipb3qHytfO9fPU1Y+ldT5F99UXrx6h05WiVK5+mcrXrIXxGlDLljmuaA+KGqWm+9quxi25ZMqEQTrAcjhi8oHgKpmxm5a9DrMKGQ/zyezDKKanpracuSxefKfvYG7AyqAr1aTj1sQrZIVh8YESm8rMz46s2P1f2sS/iBMvhEKj0zPshEpjmdYpVZPxSqlB/QOVqZ5po9QUEK4OqUL8Wozj2hbXfTxCaOC5VmK0tBdFyguVwWKip208wq3EQq7QQB0zDMKrK16/zc6X/JdsuGGec8RiVr5+qCvUHJ9bGTE+bopWrhuNTm58jm+9LOMFyOBiVmnmBX5i9x8RWCVEwU0Az/aqdf9hZ1z5Rtn004AWATXDuy1Ef7te8ni1fd1hQWpT7ezRwguVwmDzAW57sZUp/MCOVGLHC616m9DnZ7tEGIRZ+rnqNGelJ0UqHevkVe7QXFC+S7fYVnGA5HHByp4rnTW7Y0zENRA7gZEPETpVtFovDgmufqPKVy2JFy4RG3K29VPEfZbt9ASdYjiWPnwlfiRXBjsBNRJgjZCFV/JJss9gsu7D4J162/FMzDZQjwumtGBXeNfYoV34gIp+I3kxEHyaizyHqXGv9fiJ6NRG1+da01o8jokPiDq31M5FOY9s3GVbB0lr/TyJ6sdb6RKQH8d/gfUT0Oq31pHZlhBzzwnnXH+AF4e9MrFXb6CpsiFUQpmSTYcG74IaD/Vz19o44MfizMPoKilnZZr5hkfoSEd1ARA9KIWhCRLuJ6Boi+hCSjflA7t8d8tBa34mHXV4LDJNgIdGaiN5ORDnkJMo+mxDRfxHRLUT071rrY2Q/DkdiVBD+c9zUikdcm1HjSrYZJsZW3f4iVZh9wM9jVdN6D5z64wfhK2Sb+YBHQd8moj3yAe0HEZWJ6Dt9BO5D8ppgWASLiN5FRL+X/fSDiB4mokuI6DDZp8PREzOtCsItHfmBqFe1epsenyoeJ9sMI+OrtnzCjAaF6ML35qVmfiHt9xat9VuIqCIfxvmEiE6R1wWLLVg8MszJ9oNCRFUieqXs3+HoiheE7+4MEWhMBb1U8UfSfojZ30uHv+mIiM+UNOK2/EJl3h4MCIJ8+BaCYRQsrfURRHSrbDtXiOgB+PfkdRyOWLyg+AsTtW495CaaPFfZ7eXKIzVkH0OCNdKIsu25hw2nfHGttJ8LWuvPyIduoRg2wSKiZxHRZtlubyGiXUS0ZMsFORIynomeq7IVkiuD7Gg/V9qPAipVXG0Spm0BNrW3yg96U5v2qtwyHmj5sC0kwyRYvKL5c9lmviCiy+U1HY42VDY6XTrbTd31XPW/1FRxubQfBdTUlpfB9yYrPOB9ekH4aWmfFDiIefXuUWOYBIuIPi/tu8HVS6+FwBFRJM93g4heI6/rcLRQQXRtI5ThkQfb+IBS4U+k7SjhBcXrJtbtFO9rFwTrV9I2KUS0Sj5g3SCinUR0Ja+ETRHRr3utBnZjWASL/Vb3SXsJEd1GRO+GU77ZFrFkWuvjiGiDtJfApv3KDgeDDSRUEO7x89X2kYjx95Ril9NHBS+IPtaxYpirIq3ogYmp4hHSvh9a66OJiOQDJiGi7UT0UQR+xvQxSUTnyja9GBbBIqJzpK2EBalnDTQiuki2s2FRH/jzcSwBVKp4vImzsqp6NrbhKj80EVQmpP0oMZYtK/isVK7dNzex/k5slvEOad8PIjpPPlwSIrqJiDzZVsJR8InitoZBsHinnR3S1garhkT0JNlWwhthlGR7GyJ6r2zncOznp6PPmMoL9gO9ejumTbedmNaPlfajhheEN5qddtr8WHi/pW9I217gQUS8kHywbDjCO3EKECLDZR9xDINgQWClnQ1HsCcuM0REX5F92BDRd2Ubh2M/Lx3+SMZfYVcaFUQZaTuKeEH4Pfn+4J/z0uGV0rYXWuu/kg+VhIj+WbbrBxHlZT+SIRGsb0o7G/bXvYGIXpvgeA0yA2QfNkT0H/IeHA443K+WDncTLBoUvyxtRxGVjk6WgmVWD9Ph7cdu1I+T9t1Aeox8qGw4Wjs2SbkXRHSs7EsyJIJ1lbRbSDC9lPfgcECwbpbpOCZ+KTVzsrQdRfyg/IpGeIPlo0NAbDq683mrZzuc4t0gorPkQ2VDRHMakfLuzV2ThcGQCNbAuYJ7AxGFWuvHy/twLGFWpPXjvaA4YzaXaAqWSWHZqb1gy99K+1HEz1YnVTpsC4o1iwrYG3GAGDMiOl8+VDZE9DXZJila6+tlfzaLLVjsJE8cRzUfYLNXIjrIvg/HEufQ86oHeqkw6hCsNdv1eFD839J+FEFakReE9/Coit9j2Yyy/NSWQZzEF8iHyoaIzpRtkoKt42V/NktUsHCPB9j34VjiGMEK4gVrLFN8nbQfRbxg08FeEO5obKRhCVZhFkndL5H23SCib8iHyoaIAtkmCSwg/VYfF1WwwGJMCeU9OJY6511/AJzPZqMJW7CME744cJzSMDKPgvVh+VDZoK4VitjJdv1IuPo4DIJ1tbSzQW0rTG2J6Jcc0b+3x/nyHhwOON1v6IhTumy39qZmPiJtRxFMCVUQ7vZzckpY135uoCnhy+VDGsM/yHb90FqnZSeSIRGsfmEIDxHRCtnO4ZhXvCC8VJaVMYIVFM+RtqPIZL7iq3T4cIzT/WEvCBM/YBw4WpcPqg07ip8l23ajXzBmkyERrL5BrkT0Y9nO4ZhXIEwdke6Nuugbpe0o4qejv8L0z67aAIe7F0R3q6D0bGnfCyL6gXxIJUR0Y5Jodw6evFu2j2NIBOsZSe6XiD4o2/aD036Okq87HB2YOu7rRWBloY7UnJ3PXxk9VdqPGj4qqWJrMvv9NRYZSigLLe17gU0T5AMaBzvR34/dY2L6GCOirydJom4yDIIFiGiltI0DG3Ek8efxzkBIEp/hzTYOljYORxvjqfCFplJDW3XOhuPdS0VvlPajhheEX5MVG0yydxBdK22TgABR+YB2g6Pf16LKASdO/4SI7pV2/RgWwUoq2IBXFT9DRC9iYfof/O+fIbGZiC7GTkGizT7hhnAsII3g0bDYSFex/Vh3azVVHHmfhJeO1nf66O5GiZkLpW0SUMIX23TZD9pCMyyCBYjo+9K+H7xl2VaMouQ5G67rntiv6FiiqFR4QUe+HQItM+W7jlyVPH1l2Djq4vqTVCqsGx+WFOMg/LC0Twq2tZIP20IyTILFm6RukW3mCyJaI6/pcLThZaLXyJpY5sG+/B49nip+UdqPCuOZ8nEyjxD/hw9rLHX7S6X9IAxSKnhvGSbBAlzI8C7Zbr4gon0iLcyxQBxznj7ASxU3y3gsMzLJVXetSBefKduMAl4QniX9V/70LFYI60dtqPctNNcPIvqsfNgWgmETLIAqE9IHNV+glI28nsPRhkoXPzG5Qez6bLZ5H7l9CQ0r0rc83ksVZ9qi+E0lCkwHo7S0nyu8PTv8MwvGMAoW4HLPv5Dt5wri3FBTTGv9GHkth6MNb/2Og1Qmmp1YbeUV4uBt3r3UlpFaMcQKp9lIQ05zzdZfg5dH7gURPQcxWnAay4ewH0R0D6LdUbFTnmvSY6v6K6StDRH9q2yTJHdRa32ibNcN3vbr45yaNCe4+N9ZRHSo7N/h6IoXFD/WMcpKh9qMUvL17X4Qjswml15QvNJUTrWng8gnDKI7VgSl1m4u8wkRPZ+I/i8R3SIfShtOY0Ht968Q0bjW+k+bq2i8omYfdxHRSfJagNN64to023WkV3HlhZu6tePX3yTb9YO3rT+Fcw57rgYCvt5/4B4HyQ5wOFpgGqWC6FYzMgnCRx72IGxs3JCr3vT8lTcPfTApkppNcKjc+dlsDBv9UNrPN1rrx7J4vZOIPklEZ8BJzyOREzCVEvaP01o/EyOMmONZGBXZ9k201k/lXZhlG9MubkMIrfX+CNCMsbev1zfosxfczyuI6GQiOp3fO/4GpyLfkhO+R9Iv6hgyvJUzx5qVNeySbI+04M9CCk+2eu3hiyRaR66ePQTVF+TrEi9VvFqOrpCaY0aKmfKfS3vH0oJ/IA6EMPN+ic5nNsp4q2a+uvyKPe0PPE8PEcPk52o3jl+8ue9WVvOF2TsxX0/7uepdqlDfqbLlCxBjJe2ACopvjfdd3am9YGafyI907B1EdBq2GcPiAwoTYsVT2jhGCa33V+no8skN97ZPDXmkNXHpndrPV7epXOmtsul8gxgxP1+PcC+mSmihrldsfEirTOfUzrtk00EqU45kjXozulq7U48F4StkG8fSg4jOFv6010sbx4ix4vxbnqay1d9xVHiHaGHaOLFmJ6aOF4xPbX6ObL+3HLlqyyF+tnIOfFEmPsy6B1N8DzWuVlb/1G7jBeGFCHbFSFCOClWqeIVtO58Q0et4lbB5/IW0cQwPSD4XgrVPlAO34XJI30LYCXyJ8vw+yRE/nlnm52q3x4oWjmy54cjOVXf6mfJXxtLVvmVV+jGZ23aoylZOV/laDX2b2lVtAoS0Iaz2hfeO5erPaLbzVm15n6nKYJWRMba5KkZlD6l08ej2K80fWusviAfgn6SNY3hYIoL1KfEeExerHGmWTf3hCJWv3dQYuQjB4hEMRjwsXHeqXOVilSmfgBGS7KsbXlA72E+V3qKy1R+qXHUHnPuNEjAxIpmO9PKrH8AIK99sjzQbf3rr/TJnEO3hi/NSM2e1X3F+IaJPiy/H30sbx/CwRATri+I9Lh0/3WGN6eFlk1fsMSOWbkICHxMCMxsFAKM7vHR4jcqWv+0F0UdUUHwnRMkIU6r4DiQfe+nS2Sod/gS1t+BjMg59jJ5i+jZHtqJxDypX+zlWDHFvauqPy/1CfZucNhpfW8P5fttRF/821kE/XzjBGi2WiGCh4OIGBPTyBiqPlTb7Ovv7uepXjO9K7BTdcSDBOF83dhAhjJjw/4m1OxqHeX23OYf/m4BOsaonDwgaDj9fO9s7e/0TcEP+ytsm/enZYkfcGE8b/enZhwbZaGKuOMEaLZaCYDXBRr3ytSWFSkWv8qdnb8QUsW17sH4HBMk+5PkuB65hVivz9T/4mejNrfsItrxYFWq1SdS6kv61DPvWgpk5l5AZhBh/wbuljWN4WEqC5YDP6exNT1C5yidVvlaHcJkwggFEqP9R0hOrt5vyNipfm1X52dPtad14EL1dFWZ3NyqHdk5PMW30UsXvt9/1woEyv/YDMEgung2nzbwEFTm5WuenOFr+KESoS/u5gFQgpN4Q0f/hKPQPcH351gJGLzjo8nAiWqa1PgJVRJvnOMIdK6Yf5L7/hYheO1+lj7lq6V9ytDz+Pqfy3+eFuC9p3425ChYCTPmzOJGIPsHxXCfxjkod5bDnChFN8DXw+eManyaidxDRc2Ns8XkexZkVy5tTP2RB8OfT/JyeKNt2A0UUkZHB5atx/ZO11q+Sn6PW+vFE9Dy+Nv4uR9jnhw5EnatC7ZN+rvr7hg9qtwl3kCkxiQ5svYXRFE8TVa66WeVrpx+56ubWA2GEMlM+y0wNMbqLEavlGI1lymv2O2N+o5c5yXcVEV0Vc2wWD8AtMTY4/r/sF/CX7pu9qigQ0W95b8THy/b94FSh93CJ5vtl34CIdvD761knjIg8zjfcw0cKDxh2zCGiXbJfQETbiegSlFiW/SWBiF5ARN/tlWBNRH9gR3PflJ9BBYuIns4CjM81thY/V5q4kIheLNsngcUQpaN/RkQPyv4B9n4kol/hR6a5KzZ2Dcc9Mfg7P51fR07rfdbn9Gp5TRtMHTmvE/09JK8NOEk9IKK/Rhv+gUJebJP1st+h5BhsyFqoHY+YLC9T3gLHfMN3dbcJMoVDHEIGkTGHieHaYc417YyzPVMKvVz1Qq9Qf+OyCze25bOZYnyF2evNqCsm1KElVtnyTw4LSol/TZLCvyZIDp4z2CBU9osvSZJk4Sa8yWjHL203iOjP8SWX/fSCyyDHjhiIyMc307LdkfT+UZECG1TIPruBhxIi3+0BjoOIZonofbIvm0EEC9P7XkIp4Qf3W93yP+PgOvcDlekhot9AHIno59ZrSChvCpYMju31Ht9ARLfZ9v3AHgV8360KJageIvseerATzUQmehF24/Ez0be8TGWdCsIbVLp0u0pHZRxeEG5R6egGL1tZpzLlc70g+gBy/A5dU+34kCemKxMqW70AIQtdnf2ZkpkG+rnqpSvStyyIk5EFK3YEkRQIh90nRg3SJgksEn3jyojobfh1le2TQEQ3Y+QU06eaSxkdmyT7F6L6A0aEsm1Sem1okVSwiOhM224QsAN2ktGe1votc90jgEdOre8kj5KbgoWVQdv2tfLaAAn5tt0g8I9Da8RORJfJ/keXtH7sIRfXn4QD/5enJSpXfoEq1L+r8rU9jaTruFFVaMIsTNpOtvqjY8/YmNiPMSj8az/FJVGuto4riOh28UHeyq/bdmj39WZ/3R4GIroGUxsUsmMf0EVxQklEIcrStN/lIxDRG+2RkNUOUxfsWPMxjETYF7MSX74Y260YoYl+uwoWtuviHaLfj7r3qOOFGu3Sjvk3u18bTkq+VjYARPRTLsuDvw+qQXyDiG6QdqBb5dIkgoVr2DZN+LNFBDlK6fwTgoZ5ut8xjcJ9we8m+26itT6uWx00jJyI6Kv8t8T7xNZw10k7m0EFC5+PbdMENfsxymY/J3x08GOt6/fjN9SCpdbtWO4XKq/0C7OvVIWtR3vrN5lQg71holA8ws9WT1K52gaVrTzMidYxQsVxVphqrtmOHXA+J/t6NJG/UqhCKm1s4MC07bkNfFSxwX1cIPCCmDbnS1vAjta2aRrvSPO55hdawiVnUAKm7QGSIRrdBIuFI/bhRDkZ+Jhi2sRWzuAt0aQtRKFriAp20Y6b1mCUGWPbU7DiduTmZOl3Nn1HEvazFWLaXSxtAf+9azH2P8XfS9o3IaLjieh3sh0YRLDYVfCwsNnFQhwbt8if/YV2G5uhFKyJfO0DKle7QeWq/9WKjcpVMALajCh3L1s5BbstH5GtLevqS9q48XEoojeWKz1P5Wsn+JnS17yg9DMVRHtM4ClCFayt5TsOkxJ0DyLsIxWEi564OkhYAzvvUUDPtv91N5+RDRypoh18Qr6048J+tt3dRPRKaRcHHghuE2JFLuZ8h2AlnOLBQYsNU+12WWnHtbLawNRZ2sXBzvFrRFuIQtvftpdgsfM5EucxPU6UL4uRo92W23f87YnoOzF2FyUJ8OSdsjfGtE8kWLwI0zZaY0FO5BvF6Nxu22SoBAsrgn6+dgUc20akICjNmKps2TjSITZmVDRtUmTuVUEIf9VvVRBe66XDK70gvMYLwl+rINzkpaPtEJ9mEKkJIDWjqRiBsg4TgLoOAaTVi448/5EVxMVkkMBRPBzCFmIyLu26If060omNZWb7PPMW26YfWFHq9oBKweKRW6JSQ00xtNqiKmrbiA8rTcJmoIeARUsKTlvl1V6CxStw9rlt3f4W3cBqq+jjavs8h4W0rdbyyCpx6AqLllydTiRYqE4hzmE18YVtF+gDFkPsPrifgT6rBePQ86oHqkz5N/E1smIOhCjkamZF0KwGYiS27g6Odt9pCumZ6Pam6Mn2MQf6MWET+foNXr7yBnmPi8mAgvVD27aXLycO/FrbjeHcFefbfGPYqdo+v7fECNZN0qYXRHSjfX/29Ifjhey+8SAlFvMmiFmyL8Aj2JYY9BGsttU6+BFbHSeEd7i2neEIR2iNhGXcHo+UX9DeS38QTyf6SSpYgTj3/9o6TgDHDMKPavczHILlBeHXl195f4eILPiBDTDW3dHYOCJXuw3TzWPef16sD2ExSSpYPBS/1bLDwzlwsJ3t++AVw9aUh1enWqBUcXvrvSNGsC6XNr0gonPF/bU2N8FUWpzLtbdOBi+QtGLaeBS4rHm+m2DxtPVe63XENcX65fohd8i26/IT0VpxbkN762Rw7NYfrX76ChZvQlKxXsdIb0z2nQT4RMU1Fl+wJqajZ6lMtMeMiISgcOmWxKOkREe20hhNobQMCvbl69d4udl3IVxC3tuwkFSwOCH1bssODz6COTcOcGC10X6oELhnpmQ8TWhtOcYrf/Ma5hEjWAN9SXnlqwVigKxzcnQ45zpOcHaLvlqBkz0ECxHr9uvr2jodAGyVJvr6Bl5nH2bb4gDq/sv2SbEXKJIIFr4rtrOdiP5T9pkUBBmLawz0XVgQvEzpfSaswBYVFPBDKZcguq9RaaEhMBgNmcBQVHRAXapeQtb0fSFJ2kz3GgGkJko+W7lZFWpnjheiOUVGP9oMIFgIuuxY/t5b4LdC/7yRhS1mN8p72FtiBGvQEZYUJVuw2lYH96YSKFY8RV/vss51E6w3ite7xnL1I+ZhXonX2anfts1a3EpmUuwFn4SC9RLxesfCR1KI6Ej7+zwcghVE5xghscTGpMXkKpu8IFzBzvjXqVztTD9buUKlS6GXjh5sBno2qzU0BQnChvrqJv8QPqxseaeXKd2osqVLVLb0IVWoHI0SzfI+hpkhEKyj0D8LFvY5bL4+6oJ1fHvr5MQUVfy75rnFFCzOh5T7Qs4p9xTwTkSGhIL1F+L1fU2wihc1Nh99RLAgOuOp4g+kLUAow3hQ8vxs9aVeJjpRpWZO9oPo4yqITlfp4r/6ucoHVRC9V6XKx6MK6CCF/oaVAQTrYDs+ChHOiKXaiwPlmBHgZ/b1I6KD7ABQnh4u9JRwPgVLnvtAe+vkcO6izausc90E61jx+tq2TgeAiP5W9NWcEsK/tkmc+6hsnxQi+p7VTxLBwudnTwlvkH0mhYheJq4xDIIVft2UarFHWPAt5SrbVK7+euxlKNssNZIKFjtJb7bskFoxr5u6xuQNHidt9oYFFqy/F+daVWUHgf1EbU53e3Gjh2DB6d6K5uaQhrk63eVo0Xa6XyrOXdreOhm8x6S9iNNXsPZ5p/t4JnqbHGEZHxYK5JnKDNU/IulZ5WrvQSBo12DRBBy+LnoqCu6pTPnDfq56nkpHWZWvn+sX6idNrIqGdnfgpIIFOHXFZqCwhn7EBJfOacjfLXl3IQULD46d6MziMfDDhCmWfQ2t9fUDhDXIVdZTWh0nhBdXWonyHNbQysuUgZd4zyjp0t5Lf1DKR/TTV7D4XFacO7Ot4wQQ0ROQwiP6WXzBgogoONbjivWhsigCRlGVobFxKalMFKl06SoVRD9QmfJpSIJWU8UTVKp4vJra8rLxVPGvvUz4Bj+YebsXFE9R6ehLKghXqkzplyqItkEI7UoPxv+FFcPC7E4/WztjvzPOmNeyMfPBgIIlfRv3Np3m8wHieez++RoDOa+59hLyAhGCgDSip1jnFkyw+Pzl4vxAK3UI8YiJDzrVtukjWG35dZxP+Wy7fT/kCiVWgu3zHG8mA0evtG36wSOl34s+kgpWW+oRfwcHigPrEtG/+IIF/KD4seVX3td71Q9HttIIFuXYKSM2SLUxwaLbzcpiI5h0u+WQv7tlY1Yexa43zQPnzD3kKpcfE1PVYTEZRLAAIp+FPWJpEo8kkOsl001siGha9I9f+675aTZcsmSnaP8p6/xCC9Yr7PNs8++2TTfiUlZ4Wiej6XsJFvyA0imOEVrfygtAbv4AZK4i27V8T5bd96RdHCxWbRkB3D6RYHVJD8MPVEd1jjhkNkCToREsoIIou/yq+3vn+HU7WqWREerA4Q79xK/LYQJYU8VA3t9iMgfBQoXGthpPeEg4cLJrYCwnzKLCwm1wKsvzTTjWprVayP0jahz32Rot2fDqFSpMtpU64RFGazq+0ILFNnKEArv1vdJHOCm45c+x+IcY266CxefbIuXZBg80YqtiV7BR7VNGkHO72Ck5TxvrMfao8hGbFA44bUpmCxiSChafb1tgYBuI+0ndikTyyLAjMb3JUAnWiWn9WD9b+X5zZNTY3WZuorNXB2pf4fpWfffFZlDBAvzF6IDF6NucNY8KlCgtgnIqKO+xzbK7Py7xuUncQwc4yRWriyj98h5UMUUlCJl/1yTmYX40BAujnI6HkoNksRPMaRAilHdBfyhmJ20BVlBl36CfYLHNObZNE66qgfYo+4LPB2WMV8spHtuiCmrb6M4GlTu7hblwSaLPEtE/cokXfAdiS+40GUSwAMpM2zZNMOLnEjoon43vyMe5tNJd0tZmqASryUS29Fq/UM+pbHWHES8EjDZ2s+k6nRvoQDCpieG6o5E7aAJU28vLwF+GLcTkvS0WcxEsgHpDdrtBwZdK9mnDNaM6amIlgZe+40YnCy5YAFMwnorNCeRsyj6bJBEsEDdtSwrKKSdJu+L6+nMt4HePPX0fVLAAEX3ZthsETl63vwvDJ1hNvPW1g8dzlTepfPUbKlP5pcqW72zWZG/5pZDsvGZ7I/od/qvmMT37SJlky98FJ7spVZOp1FQQbvAype+pIKrLDVJNJH0Q3e/lyofJ+1oM5C8VfpWkTTd404a2rPskcA31vj4HJEtL52w/YN8tB5EFq1Uza9A8OOmstXMJJTzSasvJ6wdXv/iE7MuGiM4SbV4nbZrwSLSjgGIvMF0fJFyFSw23Sh0ngRO6j7HL6QjB+qawjxVlwIssictAA57+os7ZfdZrA/14LSpmi/np2stVOjrZz5S/roJi1ktH16h0+DsvCEMviOoqCLfh8DJRxQuiGS+IbvQypStVEP1Y5apf9NKld42no2OWFe5oOZRRbtnP1+5vbFnPooVqEBCxVOnl7XexOPAUxf4w3yttesEPJnaAacVoxcGVIM8ddNtxzqzH1C+2MmcTTMO4xnzXRQ1MQ0WbttIp/UBlANH+TdJGwg9GpteUhDcMPQeCKttL4MQXbXtG1LPvBrXl2+p52XAQMBY7WgGqg8AxVYhDQ25pSwRsOPzhWnYnmLpZ9mcqBKttSttLlAFXmPh8XKHFJuwHhY/tBLThUbB9/irZ70hyzPX6AO+STQehaB+OQzbUn3TsxmTbMiEwVaVLd7TtCM077Ixlwo7CaIsBp8S8yDq6+i16wYGl+LWFYx1fnq9xcB62tToGpYNlm0HhLaHgF2nrv5ne0w+Ov3mh9V77CoQNQgTsv1W3RYA44PznDRMg7vDpfJl3esHK4iD9HDaXe+DVuZdx6WqUsUYiN7Ybe+ugNbN6wfFo6BO+I1SB/SRv+9X2t+bPohXCwaMk8x3hKrX2d/Igu203eO8CrBRjay+Uf/4ql0h+m1zJxvV5lDen78I+xbEbNz7Om66t8LOVixASIf1cJoQiU070kDkc+yJa60kxPf+NtHEIxi665XA/P/t5lat+x+QM5sqvnwhuf/6ydPGZ2EdQ2reh9f6IqRqfqjxnMh0d42eit6l06bMqiDIqU7pNZcsPxe2UgwKAKh2FyzYOb8kZh2OhwV6JrflYQ7DOlTYOCz9bnFSFeg2xUa3o9LU7OMaqtEsFUegF4U1eEP7MC6KrVBCuVulorQrCjSod/UIF0a2Nbb+i3XCkN8slG4e9SfuJi/kKNSqf+kHpa/J+HI6lAnZMsmufsWDFLpQ4GC8TTjUqkVphB6bOVaWRa9iMajclknc1NlXF0SqVzCuICInANK9fMCl2ysGIK1Oe9ddUu25x5XCMGvCrydd6EVO1FHFrQ5e2NlRgBdCMqKSwLNCBEAg1PfvA2Krb3S+JY5+AndwI0kToRN+6WFjQkcnLLFhdwxYcjJcKA5PfJwI75+1AcnWu1pgqYhpYmN08PrV5XsulOByLBe9w1BYcy1kHWKVr8//yqh9CU9oSu7nNt21bRxfGM9FzVb62HdNCM9XDFA/hB/YWYFKE5ME5hggYNRHuKJfcDCRduxNTxd0qX/+Fn699fNmFN3ZN+HU4Rg3E03XbTZlLtyAm63LUXZe5oU14tOWmgklRK/845hfqX1HZ6movHf1eZaKdECITyd6syICyyKZMcrNUcqNkTKtKw/Ss9oLwIZUp1VWm9J9eEKZUrnqaKtSOV2t3DFTaw+EYJTDKisubTAIRne3Eam/Qev+xXP0ZGHlNFOrHcc2rD/jp8ke9IPz8eFD8gspEX1BB8XQviD7iBaWTVKZ4AsopTwQzE2PpXYkC+ByOfQmUC+IATWzZ1hfs2twrpcnhcDgWHC7RjOocea70sIsTjGdZpL4H53q3EjcOh8OxKHCRvacj3ipp6pDD4XA4HA6Hw+FwOBwOh8PhcDgcDofD4XA4HA6Hw+FwOJYe/w1ISPdp3HdfRQAAAABJRU5ErkJggg==";

function maintenanceHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Portal Alle One — indisponível no momento</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:#0b1220;background-image:radial-gradient(ellipse 100% 60% at 50% -15%,rgba(18,181,217,.11),transparent 50%);
color:#e5ecea;font-family:'Nunito',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6}
.card{width:100%;max-width:460px;text-align:center}
.logo{width:150px;height:auto;margin-bottom:32px}
h1{margin:0 0 10px;font-size:21px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 8px;font-size:14.5px;color:#97a6a3}
.bar{margin:28px auto 0;width:180px;height:3px;border-radius:999px;background:rgba(229,236,234,.12);overflow:hidden}
.bar span{display:block;width:33%;height:100%;border-radius:999px;background:#12b5d9;animation:sweep 1.2s ease-in-out infinite}
@keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.bar span{animation:none;width:100%;opacity:.5}}
.hint{margin-top:28px;font-size:12.5px;color:rgba(151,166,163,.75)}
</style>
</head>
<body>
<main class="card">
<img class="logo" src="${LOGO_DATA_URI}" alt="Alle Tecnologia">
<h1>O portal está fora do ar no momento</h1>
<p>Estamos trabalhando para restabelecer o acesso. Esta página se atualiza sozinha a cada 30 segundos.</p>
<div class="bar" role="status" aria-label="Aguardando o portal voltar"><span></span></div>
<p class="hint">Se for urgente, acione a equipe de TI pelos canais de sempre.</p>
</main>
<script>setTimeout(function(){location.reload()},30000)</script>
</body>
</html>`;
}

function maintenanceResponse() {
  return new Response(maintenanceHtml(), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Nunca cachear: precisa sumir assim que o portal voltar.
      "cache-control": "no-store, no-cache, must-revalidate",
      // Diz a buscadores e clientes que é temporário.
      "retry-after": "30",
    },
  });
}

const ORIGIN_DOWN = new Set([502, 503, 504]);

export default {
  async fetch(request) {
    try {
      const response = await fetch(request);

      if (!ORIGIN_DOWN.has(response.status)) {
        return response;
      }

      // Chamadas de API devem continuar recebendo o erro real: quem trata é o
      // frontend, e devolver HTML aqui quebraria o parse do JSON.
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/") || path.startsWith("/auth/")) {
        return response;
      }

      return maintenanceResponse();
    } catch (err) {
      // A origem não respondeu (conexão recusada, timeout).
      try {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/api/") || path.startsWith("/auth/")) {
          throw err;
        }
        return maintenanceResponse();
      } catch {
        // Último recurso: deixa o Cloudflare tratar como antes do Worker.
        throw err;
      }
    }
  },
};
