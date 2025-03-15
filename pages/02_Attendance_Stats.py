import streamlit as st
import pandas as pd
import plotly.express as px

# Page config
st.set_page_config(
    page_title="Attendance Statistics",
    page_icon="📊",
    layout="wide"
)

def load_attendance_data():
    try:
        df = pd.read_csv('Kavyamanch 2024 – Hindi Club (Responses) - Form Responses 1.csv')
        
        # Properly handle attendance values
        df['ATTENDANCE'] = df['ATTENDANCE'].fillna(False)
        df['ATTENDANCE'] = df['ATTENDANCE'].apply(lambda x: 
            True if isinstance(x, bool) and x 
            else True if isinstance(x, str) and x.lower() == 'true'
            else True if isinstance(x, (int, float)) and x == 1
            else False
        )
        return df
    except Exception as e:
        st.error(f"Error loading attendance data: {str(e)}")
        return None

def main():
    st.title("Attendance Statistics")
    
    df = load_attendance_data()
    if df is not None:
        total = len(df)
        present = int(df['ATTENDANCE'].sum())
        absent = total - present
        
        # Display metrics
        col1, col2, col3 = st.columns(3)
        col1.metric("Total Participants", total)
        col2.metric("Present", present)
        col3.metric("Absent", absent)
        
        # Create charts
        st.subheader("Attendance Overview")
        fig = px.pie(values=[present, absent], 
                    names=['Present', 'Absent'],
                    title='Attendance Distribution')
        st.plotly_chart(fig)
        
        # Detailed list
        st.subheader("Detailed Attendance List")
        attendance_df = df[['Name', 'Reg. No.', 'ATTENDANCE']].copy()
        attendance_df['ATTENDANCE'] = attendance_df['ATTENDANCE'].map({True: 'Present', False: 'Absent'})
        st.dataframe(attendance_df)
        
        # Download option
        csv = attendance_df.to_csv(index=False)
        st.download_button(
            label="Download Attendance Report",
            data=csv,
            file_name="attendance_report.csv",
            mime="text/csv"
        )

if __name__ == "__main__":
    main() 